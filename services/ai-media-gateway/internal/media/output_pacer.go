package media

import (
	"context"
	"sync"
	"sync/atomic"
	"time"
)

const (
	DefaultMaxQueuedFrames = 500
)

type PacerStats struct {
	FramesSent           uint64
	FramesDiscarded      uint64
	FramesDroppedBuffer  uint64
	PartialFramesEmitted uint64
}

// OutputPacer sends 160-byte μ-law frames at ~20 ms intervals.
type OutputPacer struct {
	sendFrame    func([]byte)
	interval     time.Duration
	maxFrames    int
	mu           sync.Mutex
	queue        [][]byte
	ctx          context.Context
	cancel       context.CancelFunc
	wg           sync.WaitGroup
	running      bool
	stats        PacerStats
	seq          atomic.Uint64
	lastTimestamp atomic.Uint32
}

func NewOutputPacer(sendFrame func([]byte)) *OutputPacer {
	return &OutputPacer{
		sendFrame: sendFrame,
		interval:  time.Duration(UlawFrameMs) * time.Millisecond,
		maxFrames: DefaultMaxQueuedFrames,
	}
}

func (p *OutputPacer) Start(ctx context.Context) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.running {
		return
	}
	p.ctx, p.cancel = context.WithCancel(ctx)
	p.running = true
	p.wg.Add(1)
	go p.loop()
}

func (p *OutputPacer) loop() {
	defer p.wg.Done()
	ticker := time.NewTicker(p.interval)
	defer ticker.Stop()
	for {
		select {
		case <-p.ctx.Done():
			return
		case <-ticker.C:
			frame := p.popFrame()
			if frame == nil {
				continue
			}
			if p.sendFrame != nil {
				p.sendFrame(frame)
			}
			p.stats.FramesSent++
			p.seq.Add(1)
			p.lastTimestamp.Add(UlawFrameBytes)
		}
	}
}

func (p *OutputPacer) popFrame() []byte {
	p.mu.Lock()
	defer p.mu.Unlock()
	if len(p.queue) == 0 {
		return nil
	}
	frame := p.queue[0]
	p.queue = p.queue[1:]
	return frame
}

// EnqueuePayload splits payload into frames and queues them.
func (p *OutputPacer) EnqueuePayload(data []byte) {
	if len(data) == 0 {
		return
	}
	var fr UlawFramer
	frames := fr.Push(data)
	if tail := fr.Flush(); tail != nil {
		p.stats.PartialFramesEmitted++
		frames = append(frames, tail)
	}
	p.enqueueFrames(frames)
}

// EnqueueFrames adds pre-sized frames to the queue.
func (p *OutputPacer) EnqueueFrames(frames [][]byte) {
	p.enqueueFrames(frames)
}

func (p *OutputPacer) enqueueFrames(frames [][]byte) {
	if len(frames) == 0 {
		return
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	for _, frame := range frames {
		if len(frame) == 0 {
			continue
		}
		toQueue := frame
		if len(frame) != UlawFrameBytes {
			var fr UlawFramer
			split := fr.Push(frame)
			if tail := fr.Flush(); tail != nil {
				p.stats.PartialFramesEmitted++
				split = append(split, tail)
			}
			for _, sf := range split {
				if len(p.queue) >= p.maxFrames {
					p.stats.FramesDroppedBuffer++
					continue
				}
				cp := make([]byte, UlawFrameBytes)
				copy(cp, sf)
				p.queue = append(p.queue, cp)
			}
			continue
		}
		if len(p.queue) >= p.maxFrames {
			p.stats.FramesDroppedBuffer++
			continue
		}
		cp := make([]byte, UlawFrameBytes)
		copy(cp, toQueue)
		p.queue = append(p.queue, cp)
	}
}

// Cancel stops pacing immediately and discards queued frames.
func (p *OutputPacer) Cancel() int {
	if p.cancel != nil {
		p.cancel()
	}
	p.wg.Wait()
	p.mu.Lock()
	discarded := len(p.queue)
	p.stats.FramesDiscarded += uint64(discarded)
	p.queue = nil
	p.running = false
	p.mu.Unlock()
	return discarded
}

func (p *OutputPacer) Stats() PacerStats {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.stats
}

func (p *OutputPacer) QueuedLen() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.queue)
}

func (p *OutputPacer) SequenceProgression() uint64 {
	return p.seq.Load()
}

func (p *OutputPacer) TimestampProgression() uint32 {
	return p.lastTimestamp.Load()
}

func (p *OutputPacer) IsRunning() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.running
}

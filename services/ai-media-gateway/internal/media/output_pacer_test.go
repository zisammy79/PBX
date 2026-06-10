package media

import (
	"context"
	"testing"
	"time"
)

func TestOutputPacerExact160(t *testing.T) {
	var sent [][]byte
	p := NewOutputPacer(func(payload []byte) {
		cp := make([]byte, len(payload))
		copy(cp, payload)
		sent = append(sent, cp)
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	p.Start(ctx)
	p.EnqueuePayload(make([]byte, UlawFrameBytes))
	time.Sleep(30 * time.Millisecond)
	p.Cancel()
	if len(sent) != 1 || len(sent[0]) != UlawFrameBytes {
		t.Fatalf("expected one 160-byte frame, sent=%d", len(sent))
	}
}

func TestOutputPacerMultipleFramesInBuffer(t *testing.T) {
	var count int
	p := NewOutputPacer(func([]byte) { count++ })
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	p.Start(ctx)
	p.EnqueuePayload(make([]byte, UlawFrameBytes*3))
	time.Sleep(80 * time.Millisecond)
	p.Cancel()
	if count < 2 {
		t.Fatalf("expected multiple paced frames, got %d", count)
	}
}

func TestOutputPacerPartialFinalFrame(t *testing.T) {
	var sent int
	p := NewOutputPacer(func(payload []byte) {
		if len(payload) == UlawFrameBytes {
			sent++
		}
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	p.Start(ctx)
	p.EnqueuePayload(make([]byte, 40))
	time.Sleep(30 * time.Millisecond)
	p.Cancel()
	if sent != 1 {
		t.Fatalf("expected padded partial frame")
	}
	stats := p.Stats()
	if stats.PartialFramesEmitted != 1 {
		t.Fatalf("expected partial frame stat")
	}
}

func TestOutputPacerEmptyPayload(t *testing.T) {
	p := NewOutputPacer(func([]byte) { t.Fatal("should not send") })
	p.EnqueuePayload(nil)
}

func TestOutputPacerCancellationDiscardsQueued(t *testing.T) {
	p := NewOutputPacer(func([]byte) {})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	p.Start(ctx)
	frames := make([][]byte, 0, 50)
	for i := 0; i < 50; i++ {
		frames = append(frames, make([]byte, UlawFrameBytes))
	}
	p.EnqueueFrames(frames)
	discarded := p.Cancel()
	if discarded == 0 {
		t.Fatal("expected discarded queued frames")
	}
	if p.QueuedLen() != 0 {
		t.Fatal("queue should be empty after cancel")
	}
}

func TestOutputPacerSequenceAndTimestamp(t *testing.T) {
	p := NewOutputPacer(func([]byte) {})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	p.Start(ctx)
	p.EnqueuePayload(make([]byte, UlawFrameBytes*2))
	time.Sleep(60 * time.Millisecond)
	p.Cancel()
	if p.SequenceProgression() == 0 {
		t.Fatal("expected sequence progression")
	}
	if p.TimestampProgression() == 0 {
		t.Fatal("expected timestamp progression")
	}
}

func TestOutputPacerBufferLimit(t *testing.T) {
	p := NewOutputPacer(func([]byte) {})
	p.maxFrames = 2
	frames := [][]byte{make([]byte, UlawFrameBytes), make([]byte, UlawFrameBytes), make([]byte, UlawFrameBytes)}
	p.EnqueueFrames(frames)
	if p.QueuedLen() != 2 {
		t.Fatalf("expected queue capped at 2, got %d", p.QueuedLen())
	}
	stats := p.Stats()
	if stats.FramesDroppedBuffer != 1 {
		t.Fatalf("expected 1 dropped frame, got %d", stats.FramesDroppedBuffer)
	}
}

package media

import (
	"encoding/binary"
	"net"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

const rtpHeaderSize = 12

type RTPBridge struct {
	conn          *net.UDPConn
	remote        *net.UDPAddr
	mu            sync.Mutex
	seq           uint16
	ts            uint32
	ssrc          uint32
	rxFrames      atomic.Uint64
	txFrames      atomic.Uint64
	rxBytes       atomic.Uint64
	txBytes       atomic.Uint64
	firstInbound  atomic.Int64
	firstOutbound atomic.Int64
	startedAt     time.Time
	onAudio       func(payload []byte)
	closed        atomic.Bool
}

func NewRTPBridge(host string, port int, onAudio func([]byte)) (*RTPBridge, error) {
	addr, err := net.ResolveUDPAddr("udp", net.JoinHostPort(host, strconv.Itoa(port)))
	if err != nil {
		return nil, err
	}
	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		return nil, err
	}
	b := &RTPBridge{
		conn:      conn,
		ssrc:      uint32(0x8e000000 | uint32(port)),
		onAudio:   onAudio,
		startedAt: time.Now().UTC(),
	}
	go b.readLoop()
	return b, nil
}

func (b *RTPBridge) SetRemote(addr *net.UDPAddr) {
	b.mu.Lock()
	b.remote = addr
	b.mu.Unlock()
}

func (b *RTPBridge) readLoop() {
	buf := make([]byte, 2048)
	for {
		n, addr, err := b.conn.ReadFromUDP(buf)
		if err != nil || b.closed.Load() {
			return
		}
		if n <= rtpHeaderSize {
			continue
		}
		b.mu.Lock()
		b.remote = addr
		b.mu.Unlock()
		payload := buf[rtpHeaderSize:n]
		b.rxFrames.Add(1)
		b.rxBytes.Add(uint64(len(payload)))
		if b.firstInbound.Load() == 0 {
			b.firstInbound.Store(time.Since(b.startedAt).Milliseconds())
		}
		if b.onAudio != nil {
			b.onAudio(payload)
		}
	}
}

func (b *RTPBridge) SendULaw(payload []byte) {
	if len(payload) == 0 {
		return
	}
	var fr UlawFramer
	frames := fr.Push(payload)
	if tail := fr.Flush(); tail != nil {
		frames = append(frames, tail)
	}
	for _, frame := range frames {
		b.sendULawFrame(frame)
	}
}

func (b *RTPBridge) SendULawFrame(frame []byte) {
	if len(frame) == 0 {
		return
	}
	if len(frame) > UlawFrameBytes {
		frame = frame[:UlawFrameBytes]
	}
	payload := frame
	if len(payload) < UlawFrameBytes {
		padded := make([]byte, UlawFrameBytes)
		copy(padded, payload)
		for i := len(payload); i < UlawFrameBytes; i++ {
			padded[i] = UlawSilenceByte
		}
		payload = padded
	}
	b.sendULawFrame(payload)
}

func (b *RTPBridge) sendULawFrame(payload []byte) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.remote == nil {
		return
	}
	pkt := make([]byte, rtpHeaderSize+len(payload))
	pkt[0] = 0x80
	pkt[1] = 0x00
	binary.BigEndian.PutUint16(pkt[2:], b.seq)
	b.seq++
	binary.BigEndian.PutUint32(pkt[4:], b.ts)
	b.ts += UlawFrameBytes
	binary.BigEndian.PutUint32(pkt[8:], b.ssrc)
	copy(pkt[rtpHeaderSize:], payload)
	_, _ = b.conn.WriteToUDP(pkt, b.remote)
	b.txFrames.Add(1)
	b.txBytes.Add(uint64(len(payload)))
	if b.firstOutbound.Load() == 0 {
		b.firstOutbound.Store(time.Since(b.startedAt).Milliseconds())
	}
}

func (b *RTPBridge) Stats() (rx, tx uint64) {
	return b.rxFrames.Load(), b.txFrames.Load()
}

func (b *RTPBridge) StatsDetail() (rxPackets, txPackets, rxBytes, txBytes uint64, firstInMs, firstOutMs int64) {
	return b.rxFrames.Load(), b.txFrames.Load(), b.rxBytes.Load(), b.txBytes.Load(), b.firstInbound.Load(), b.firstOutbound.Load()
}

func (b *RTPBridge) NextSequence() uint16 {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.seq
}

func (b *RTPBridge) NextTimestamp() uint32 {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.ts
}

func (b *RTPBridge) Close() {
	b.closed.Store(true)
	_ = b.conn.Close()
}

func (b *RTPBridge) Host() string {
	return b.conn.LocalAddr().(*net.UDPAddr).IP.String()
}

func (b *RTPBridge) Port() int {
	return b.conn.LocalAddr().(*net.UDPAddr).Port
}

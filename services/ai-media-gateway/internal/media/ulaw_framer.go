package media

const (
	UlawSampleRateHz = 8000
	UlawFrameBytes   = 160
	UlawFrameMs      = 20
	UlawSilenceByte  = 0xff
)

// UlawFramer splits arbitrary μ-law payloads into 20 ms (160-byte) frames.
type UlawFramer struct {
	carry []byte
}

// Push appends data and returns complete 160-byte frames.
func (f *UlawFramer) Push(data []byte) [][]byte {
	if len(data) == 0 {
		return nil
	}
	buf := make([]byte, 0, len(f.carry)+len(data))
	buf = append(buf, f.carry...)
	buf = append(buf, data...)
	f.carry = nil
	var frames [][]byte
	for len(buf) >= UlawFrameBytes {
		frame := make([]byte, UlawFrameBytes)
		copy(frame, buf[:UlawFrameBytes])
		frames = append(frames, frame)
		buf = buf[UlawFrameBytes:]
	}
	if len(buf) > 0 {
		f.carry = append(f.carry[:0], buf...)
	}
	return frames
}

// Flush emits a final partial frame padded with μ-law silence.
func (f *UlawFramer) Flush() []byte {
	if len(f.carry) == 0 {
		return nil
	}
	frame := make([]byte, UlawFrameBytes)
	copy(frame, f.carry)
	for i := len(f.carry); i < UlawFrameBytes; i++ {
		frame[i] = UlawSilenceByte
	}
	f.carry = nil
	return frame
}

// RemainderLen returns buffered bytes not yet framed.
func (f *UlawFramer) RemainderLen() int {
	return len(f.carry)
}

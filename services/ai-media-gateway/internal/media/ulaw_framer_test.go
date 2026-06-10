package media

import "testing"

func TestUlawFramerExact160(t *testing.T) {
	var f UlawFramer
	in := make([]byte, UlawFrameBytes)
	for i := range in {
		in[i] = byte(i)
	}
	frames := f.Push(in)
	if len(frames) != 1 || len(frames[0]) != UlawFrameBytes {
		t.Fatalf("expected 1 frame, got %d", len(frames))
	}
	if f.RemainderLen() != 0 {
		t.Fatalf("unexpected remainder %d", f.RemainderLen())
	}
}

func TestUlawFramerMultipleFrames(t *testing.T) {
	var f UlawFramer
	in := make([]byte, UlawFrameBytes*3)
	frames := f.Push(in)
	if len(frames) != 3 {
		t.Fatalf("expected 3 frames, got %d", len(frames))
	}
}

func TestUlawFramerPartialFinal(t *testing.T) {
	var f UlawFramer
	frames := f.Push(make([]byte, 80))
	if len(frames) != 0 {
		t.Fatalf("expected no complete frames yet")
	}
	final := f.Flush()
	if len(final) != UlawFrameBytes {
		t.Fatalf("expected padded final frame")
	}
	for i := 80; i < UlawFrameBytes; i++ {
		if final[i] != UlawSilenceByte {
			t.Fatalf("expected silence pad at %d", i)
		}
	}
}

func TestUlawFramerEmpty(t *testing.T) {
	var f UlawFramer
	if frames := f.Push(nil); len(frames) != 0 {
		t.Fatal("expected no frames")
	}
	if f.Flush() != nil {
		t.Fatal("expected nil flush")
	}
}

func TestUlawFramerCarryAcrossPush(t *testing.T) {
	var f UlawFramer
	_ = f.Push(make([]byte, 100))
	frames := f.Push(make([]byte, 100))
	if len(frames) != 1 {
		t.Fatalf("expected 1 frame from carry, got %d", len(frames))
	}
}

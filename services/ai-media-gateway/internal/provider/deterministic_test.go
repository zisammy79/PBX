package provider

import "testing"

func TestDeterministicConversation(t *testing.T) {
	p := NewDeterministicProvider()
	ctx := t.Context()
	s, err := p.Connect(ctx, "deterministic-v1")
	if err != nil {
		t.Fatal(err)
	}
	frame := AudioFrame{PCM16: make([]byte, 160), SampleRateHz: 16000}
	out, transcript, err := p.SendAudio(s.ID, frame)
	if err != nil || len(out.PCM16) == 0 || transcript == "" {
		t.Fatalf("unexpected send result err=%v len=%d transcript=%q", err, len(out.PCM16), transcript)
	}
	if !p.CancelResponse(s.ID) {
		t.Fatal("expected cancel true")
	}
	p.Disconnect(s.ID)
}

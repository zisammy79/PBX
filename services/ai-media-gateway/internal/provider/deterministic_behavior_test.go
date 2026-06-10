package provider

import "testing"

func TestBehaviorLongResponseAndBargeIn(t *testing.T) {
	p := NewDeterministicProvider()
	s, err := p.ConnectSession(DeterministicBehaviorModel, "tenant-a", "platform-session-1")
	if err != nil {
		t.Fatal(err)
	}
	defer p.Disconnect(s.ID)

	_, frames := p.BeginLongResponse(s.ID)
	if len(frames) != behaviorLongResponseFrames {
		t.Fatalf("expected %d frames, got %d", behaviorLongResponseFrames, len(frames))
	}
	for i := 0; i < behaviorMinFramesBeforeBargeIn; i++ {
		p.NoteResponseFrameSent(s.ID)
	}
	if !p.NoteInboundDuringResponse(s.ID) {
		t.Fatal("expected barge-in eligibility")
	}
	diag := p.InterruptResponse(s.ID, 42)
	if diag.QueuedFramesDiscarded != 42 || diag.OldResponseFramesSent < behaviorMinFramesBeforeBargeIn {
		t.Fatalf("unexpected diag %+v", diag)
	}
	second := p.BeginSecondResponse(s.ID)
	if len(second) == 0 {
		t.Fatal("expected second response frames")
	}
	for i := 0; i < behaviorSecondTurnInputFrames; i++ {
		if tool := p.NoteSecondTurnInput(s.ID); i == behaviorSecondTurnInputFrames-1 {
			if tool == nil || tool.ToolName != ToolTransferCall {
				t.Fatalf("expected transfer tool, got %+v", tool)
			}
			if dest, _ := tool.Arguments["destination"].(string); dest != "human_support" {
				t.Fatalf("unexpected destination %q", dest)
			}
		}
	}
}

func TestBehaviorFrameSize(t *testing.T) {
	p := NewDeterministicProvider()
	frame := p.ulawToneFrame(3)
	if len(frame) != UlawFrameBytes {
		t.Fatalf("expected %d-byte frame", UlawFrameBytes)
	}
}

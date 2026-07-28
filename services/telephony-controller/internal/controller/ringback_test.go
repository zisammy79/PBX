package controller

import (
	"testing"

	"github.com/pbx-platform/telephony-controller/internal/calls"
)

func TestRingbackToneURI(t *testing.T) {
	t.Parallel()
	if ringbackToneURI() != "tone:ring" {
		t.Fatalf("unexpected ringback tone: %s", ringbackToneURI())
	}
}

func TestIsCalleeLeg(t *testing.T) {
	t.Parallel()
	active := &calls.ActiveCall{
		CalleeChannelID:         "callee-1",
		PendingCalleeChannelIDs: []string{"callee-2", "callee-3"},
	}
	if !isCalleeLeg(active, "callee-1") || !isCalleeLeg(active, "callee-2") {
		t.Fatal("expected callee leg match")
	}
	if isCalleeLeg(active, "caller-1") || isCalleeLeg(nil, "callee-1") {
		t.Fatal("expected no callee leg match")
	}
}

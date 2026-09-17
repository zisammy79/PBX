package controller

import (
	"testing"

	"github.com/pbx-platform/telephony-controller/internal/calls"
)

func TestCallAnswerWebhookPayloadIncludesNumbers(t *testing.T) {
	t.Parallel()
	active := &calls.ActiveCall{
		CallerNumber: "1001",
		CalleeNumber: "1002",
		BridgeID:     "bridge-abc",
	}
	payload := callAnswerWebhookPayload(active, map[string]any{"bridgeId": active.BridgeID})
	if payload["caller"] != "1001" {
		t.Fatalf("caller = %v, want 1001", payload["caller"])
	}
	if payload["callee"] != "1002" {
		t.Fatalf("callee = %v, want 1002", payload["callee"])
	}
	if payload["bridgeId"] != "bridge-abc" {
		t.Fatalf("bridgeId = %v, want bridge-abc", payload["bridgeId"])
	}
}

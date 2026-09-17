package controller

import "github.com/pbx-platform/telephony-controller/internal/calls"

// callAnswerWebhookPayload builds NATS/webhook payload fields for answer/bridge events.
func callAnswerWebhookPayload(active *calls.ActiveCall, extra map[string]any) map[string]any {
	payload := map[string]any{"source": "platform"}
	if active.CallerNumber != "" {
		payload["caller"] = active.CallerNumber
	}
	if active.CalleeNumber != "" {
		payload["callee"] = active.CalleeNumber
	}
	for key, value := range extra {
		payload[key] = value
	}
	return payload
}

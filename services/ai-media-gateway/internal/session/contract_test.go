package session

import (
	"bytes"
	"encoding/json"
	"testing"
)

// telephonyGatewaySessionRequest mirrors services/telephony-controller/internal/controller/ai.go.
type telephonyGatewaySessionRequest struct {
	SessionID            string   `json:"sessionId"`
	TenantID             string   `json:"tenantId"`
	CallID               string   `json:"callId"`
	CorrelationID        string   `json:"correlationId"`
	AgentID              string   `json:"agentId"`
	AgentVersionID       string   `json:"agentVersionId"`
	Provider             string   `json:"provider"`
	Model                string   `json:"model"`
	Voice                string   `json:"voice"`
	Language             string   `json:"language"`
	SystemInstructions   string   `json:"systemInstructions"`
	OpeningMessage       string   `json:"openingMessage"`
	AllowedTools         []string `json:"allowedTools"`
	CredentialsEncrypted string   `json:"credentialsEncrypted,omitempty"`
	TransferExtension    string   `json:"transferExtension"`
	AudioFormat          string   `json:"audioFormat"`
}

func TestTelephonyControllerJSONContract(t *testing.T) {
	src := telephonyGatewaySessionRequest{
		SessionID:          "11111111-1111-1111-1111-111111111111",
		TenantID:           "22222222-2222-2222-2222-222222222222",
		CallID:             "33333333-3333-3333-3333-333333333333",
		CorrelationID:      "44444444-4444-4444-4444-444444444444",
		AgentID:            "55555555-5555-5555-5555-555555555555",
		AgentVersionID:     "66666666-6666-6666-6666-666666666666",
		Provider:           "deterministic-test",
		Model:              "deterministic-v1",
		Voice:              "default",
		Language:           "en",
		SystemInstructions: "test-only deterministic agent",
		OpeningMessage:     "hello from deterministic provider",
		AllowedTools:       []string{},
		TransferExtension:  "1002",
		AudioFormat:        "ulaw",
	}
	body, err := json.Marshal(src)
	if err != nil {
		t.Fatal(err)
	}

	got, err := DecodeCreateRequest(bytes.NewReader(body))
	if err != nil {
		t.Fatalf("gateway failed to decode telephony JSON: %v", err)
	}
	if got.TenantID != src.TenantID {
		t.Fatalf("tenantId mismatch: %q", got.TenantID)
	}
	if got.CallID != src.CallID {
		t.Fatalf("callId mismatch: %q", got.CallID)
	}
	if got.SessionID != src.SessionID {
		t.Fatalf("sessionId mismatch: %q", got.SessionID)
	}
	if got.AgentID != src.AgentID {
		t.Fatalf("agentId mismatch: %q", got.AgentID)
	}
	if got.AgentVersionID != src.AgentVersionID {
		t.Fatalf("agentVersionId mismatch: %q", got.AgentVersionID)
	}
	if got.CorrelationID != src.CorrelationID {
		t.Fatalf("correlationId mismatch: %q", got.CorrelationID)
	}
	if got.Provider != src.Provider {
		t.Fatalf("provider mismatch: %q", got.Provider)
	}
	if got.AudioFormat != "ulaw" {
		t.Fatalf("audioFormat mismatch: %q", got.AudioFormat)
	}
}

func TestTelephonyJSONContractFailsWithoutSessionIDTag(t *testing.T) {
	raw := map[string]any{
		"tenantId":       "22222222-2222-2222-2222-222222222222",
		"callId":         "33333333-3333-3333-3333-333333333333",
		"correlationId":  "44444444-4444-4444-4444-444444444444",
		"agentId":        "55555555-5555-5555-5555-555555555555",
		"agentVersionId": "66666666-6666-6666-6666-666666666666",
		"provider":       "deterministic-test",
		"audioFormat":    "ulaw",
	}
	body, _ := json.Marshal(raw)
	_, err := DecodeCreateRequest(bytes.NewReader(body))
	if err == nil {
		t.Fatal("expected validation failure when sessionId tag is omitted from payload")
	}
}

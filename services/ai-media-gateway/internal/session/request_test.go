package session

import (
	"bytes"
	"strings"
	"testing"
)

func TestDecodeCreateRequestValid(t *testing.T) {
	body := `{
		"sessionId":"s1",
		"tenantId":"t1",
		"callId":"c1",
		"correlationId":"r1",
		"agentId":"a1",
		"agentVersionId":"v1",
		"provider":"deterministic-test",
		"audioFormat":"ulaw"
	}`
	req, err := DecodeCreateRequest(strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	if req.SessionID != "s1" || req.TenantID != "t1" || req.AgentID != "a1" {
		t.Fatalf("unexpected decode: %+v", req)
	}
	if req.AudioFormat != "ulaw" {
		t.Fatalf("expected normalized ulaw, got %q", req.AudioFormat)
	}
}

func TestDecodeCreateRequestRejectsUnknownFields(t *testing.T) {
	body := `{"sessionId":"s1","tenantId":"t1","callId":"c1","correlationId":"r1","agentId":"a1","agentVersionId":"v1","provider":"deterministic-test","audioFormat":"ulaw","unexpected":true}`
	_, err := DecodeCreateRequest(strings.NewReader(body))
	if err == nil {
		t.Fatal("expected unknown field error")
	}
}

func TestDecodeCreateRequestRejectsMissingRequired(t *testing.T) {
	body := `{"provider":"deterministic-test","audioFormat":"ulaw"}`
	_, err := DecodeCreateRequest(strings.NewReader(body))
	verr, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("expected ValidationError, got %T: %v", err, err)
	}
	if len(verr.Fields) < 4 {
		t.Fatalf("expected multiple field errors, got %+v", verr.Fields)
	}
}

func TestDecodeCreateRequestRejectsUnsupportedProvider(t *testing.T) {
	body := bytes.NewBufferString(`{
		"sessionId":"s1","tenantId":"t1","callId":"c1","correlationId":"r1",
		"agentId":"a1","agentVersionId":"v1","provider":"gemini","audioFormat":"ulaw"
	}`)
	_, err := DecodeCreateRequest(body)
	verr, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("expected ValidationError, got %v", err)
	}
	found := false
	for _, f := range verr.Fields {
		if f.Field == "provider" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected provider validation error, got %+v", verr.Fields)
	}
}

func TestDecodeCreateRequestOpenAIRequiresCredentials(t *testing.T) {
	body := bytes.NewBufferString(`{
		"sessionId":"s1","tenantId":"t1","callId":"c1","correlationId":"r1",
		"agentId":"a1","agentVersionId":"v1","provider":"openai","audioFormat":"ulaw"
	}`)
	_, err := DecodeCreateRequest(body)
	verr, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("expected ValidationError, got %v", err)
	}
	found := false
	for _, f := range verr.Fields {
		if f.Field == "credentialsEncrypted" {
			found = true
		}
	}
	if !found {
		t.Fatalf("expected credentialsEncrypted validation error, got %+v", verr.Fields)
	}
}

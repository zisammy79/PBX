package provider

import (
	"os"
	"testing"
)

func TestOpenAIContractManifest(t *testing.T) {
	m := ContractTestManifest()
	if m.ProviderID != OpenAIProviderID {
		t.Fatalf("provider id %q", m.ProviderID)
	}
	if !m.InterruptionSupport || !m.ToolCallingSupport {
		t.Fatal("expected interruption and tool support")
	}
	found := false
	for _, f := range m.AudioInputFormats {
		if f == "g711_ulaw" || f == "ulaw" {
			found = true
		}
	}
	if !found {
		t.Fatal("expected ulaw in input formats")
	}
	if len(m.Models) == 0 {
		t.Fatal("expected models")
	}
}

func TestOpenAIConnectRequiresCredentials(t *testing.T) {
	p := NewOpenAIRealtimeProvider()
	_, err := p.ConnectFromRequest(
		t.Context(),
		"invalid",
		"gpt-4o-realtime-preview",
		"alloy",
		"test",
		"",
		nil,
		"tenant",
		"sess",
		"call",
		nil, nil, nil, nil,
	)
	if err == nil {
		t.Fatal("expected error without valid credentials")
	}
}

func TestSupportedModelsFromEnv(t *testing.T) {
	t.Setenv("OPENAI_REALTIME_MODELS", "custom-model-a,custom-model-b")
	models := supportedOpenAIModels()
	if len(models) != 2 || models[0] != "custom-model-a" {
		t.Fatalf("unexpected models: %v", models)
	}
}

func TestSanitizeOpenAIError(t *testing.T) {
	if sanitizeOpenAIError("Invalid API key provided", "401") != "provider authentication failed" {
		t.Fatal("expected auth sanitization")
	}
	if sanitizeOpenAIError("Rate limit reached", "429") != "provider rate limit exceeded" {
		t.Fatal("expected rate limit sanitization")
	}
}

func TestBuildOpenAIToolsDefault(t *testing.T) {
	tools := buildOpenAITools(nil)
	if len(tools) < 2 {
		t.Fatalf("expected default tools, got %d", len(tools))
	}
}

func TestOpenAIProviderIDConstant(t *testing.T) {
	if OpenAIProviderID != "openai" {
		t.Fatal("unexpected provider id")
	}
	_ = os.Getenv("OPENAI_REALTIME_URL")
}

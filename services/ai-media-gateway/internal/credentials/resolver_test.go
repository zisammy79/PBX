package credentials

import (
	"encoding/json"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestResolverRejectsMissingToken(t *testing.T) {
	r := &Resolver{apiURL: "http://example", token: "", client: http.DefaultClient}
	_, err := r.ResolveAI(context.Background(), "tenant-1", "openai", "default")
	if err == nil {
		t.Fatal("expected error")
	}
	re, ok := err.(*ResolveError)
	if !ok || re.Category != FailureResolverUnavailable {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResolverMapsUnauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"error":"CREDENTIAL_RESOLUTION_DENIED","message":"denied"}`))
	}))
	defer srv.Close()

	r := &Resolver{apiURL: srv.URL, token: "secret", client: srv.Client()}
	_, err := r.ResolveAI(context.Background(), "tenant-1", "openai", "default")
	re, ok := err.(*ResolveError)
	if !ok || re.Category != FailureResolutionDenied {
		t.Fatalf("expected resolution denied, got %v", err)
	}
}

func TestResolverReturnsSecretsOnlyInMemory(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer secret" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"credentialSource":"PLATFORM_DEFAULT",
			"connectionId":"conn-1",
			"credentialVersion":2,
			"provider":"openai",
			"integrationType":"ai",
			"environment":"default",
			"config":{"model":"gpt-4o-realtime-preview","voice":"alloy"},
			"secrets":{"apiKey":"sk-test"}
		}`))
	}))
	defer srv.Close()

	r := &Resolver{apiURL: srv.URL, token: "secret", client: srv.Client()}
	res, err := r.ResolveAI(context.Background(), "tenant-1", "openai", "default")
	if err != nil {
		t.Fatal(err)
	}
	if res.Secrets["apiKey"] != "sk-test" {
		t.Fatalf("expected secret in memory")
	}
	meta := CredentialMeta(res)
	if _, ok := meta["apiKey"]; ok {
		t.Fatal("secret must not appear in metadata")
	}
	if meta["credentialVersion"] != 2 {
		t.Fatalf("unexpected version: %v", meta["credentialVersion"])
	}
}

func TestCredentialMetaOmitsSecrets(t *testing.T) {
	meta := CredentialMeta(&Resolved{
		ConnectionID:      "id",
		CredentialVersion: 1,
		Source:            "PLATFORM_UI",
		Secrets:           map[string]string{"apiKey": "sk-secret"},
	})
	raw, err := json.Marshal(meta)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "sk-secret") || strings.Contains(string(raw), "apiKey") {
		t.Fatalf("metadata leaked secret: %s", raw)
	}
}

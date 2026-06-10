package credentials

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const (
	FailureNotConfigured         = "CREDENTIAL_NOT_CONFIGURED"
	FailureDisabled              = "CREDENTIAL_DISABLED"
	FailureResolutionDenied      = "CREDENTIAL_RESOLUTION_DENIED"
	FailureResolverUnavailable   = "CREDENTIAL_RESOLVER_UNAVAILABLE"
	FailureDecryptionFailed      = "CREDENTIAL_DECRYPTION_FAILED"
	FailureProviderAuth          = "PROVIDER_AUTHENTICATION_FAILED"
)

// Resolved holds decrypted integration credentials in process memory only.
type Resolved struct {
	Source            string
	ConnectionID      string
	CredentialVersion int
	Provider          string
	IntegrationType   string
	Environment       string
	Config            map[string]any
	Secrets           map[string]string
}

// ResolveError is a sanitized resolver failure.
type ResolveError struct {
	Category string
	Message  string
}

func (e *ResolveError) Error() string {
	if e.Message == "" {
		return e.Category
	}
	return e.Message
}

// Resolver calls the platform internal integration resolve API.
type Resolver struct {
	apiURL string
	token  string
	client *http.Client
}

func NewResolverFromEnv() *Resolver {
	url := strings.TrimRight(strings.TrimSpace(os.Getenv("API_INTERNAL_URL")), "/")
	if url == "" {
		url = strings.TrimRight(strings.TrimSpace(os.Getenv("PUBLIC_API_URL")), "/")
	}
	if url == "" {
		url = "http://api:3001"
	}
	return &Resolver{
		apiURL: url,
		token:  strings.TrimSpace(os.Getenv("INTERNAL_SERVICE_TOKEN")),
		client: &http.Client{Timeout: 12 * time.Second},
	}
}

type resolveRequest struct {
	IntegrationType string `json:"integrationType"`
	Provider        string `json:"provider"`
	TenantID        string `json:"tenantId,omitempty"`
	Environment     string `json:"environment,omitempty"`
}

type resolveResponse struct {
	CredentialSource  string            `json:"credentialSource"`
	ConnectionID      string            `json:"connectionId"`
	CredentialVersion int               `json:"credentialVersion"`
	Provider          string            `json:"provider"`
	IntegrationType   string            `json:"integrationType"`
	Environment       string            `json:"environment"`
	Config            map[string]any      `json:"config"`
	Secrets           map[string]string `json:"secrets"`
	Error             string            `json:"error"`
	Message           string            `json:"message"`
}

func (r *Resolver) Health(ctx context.Context) error {
	if r.apiURL == "" {
		return &ResolveError{Category: FailureResolverUnavailable, Message: "resolver URL not configured"}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.apiURL+"/api/v1/internal/integrations/health", nil)
	if err != nil {
		return &ResolveError{Category: FailureResolverUnavailable, Message: "resolver health request failed"}
	}
	if r.token != "" {
		req.Header.Set("Authorization", "Bearer "+r.token)
	}
	resp, err := r.client.Do(req)
	if err != nil {
		return &ResolveError{Category: FailureResolverUnavailable, Message: "credential resolver unavailable"}
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return &ResolveError{Category: FailureResolverUnavailable, Message: "credential resolver unavailable"}
	}
	return nil
}

func (r *Resolver) ResolveAI(ctx context.Context, tenantID, provider, environment string) (*Resolved, error) {
	if provider == "" {
		provider = "openai"
	}
	if environment == "" {
		environment = "default"
	}
	return r.resolve(ctx, resolveRequest{
		IntegrationType: "ai",
		Provider:        provider,
		TenantID:        tenantID,
		Environment:     environment,
	})
}

func (r *Resolver) resolve(ctx context.Context, body resolveRequest) (*Resolved, error) {
	if r.token == "" {
		return nil, &ResolveError{Category: FailureResolverUnavailable, Message: "internal service token not configured"}
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, &ResolveError{Category: FailureResolverUnavailable, Message: "resolver request encoding failed"}
	}

	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		resolved, err := r.doResolve(ctx, payload)
		if err == nil {
			return resolved, nil
		}
		lastErr = err
		re, ok := err.(*ResolveError)
		if !ok || re.Category == FailureResolverUnavailable {
			time.Sleep(time.Duration(attempt+1) * 200 * time.Millisecond)
			continue
		}
		return nil, err
	}
	return nil, lastErr
}

func (r *Resolver) doResolve(ctx context.Context, payload []byte) (*Resolved, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, r.apiURL+"/api/v1/internal/integrations/resolve", bytes.NewReader(payload))
	if err != nil {
		return nil, &ResolveError{Category: FailureResolverUnavailable, Message: "resolver request failed"}
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+r.token)

	resp, err := r.client.Do(req)
	if err != nil {
		return nil, &ResolveError{Category: FailureResolverUnavailable, Message: "credential resolver unavailable"}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	var out resolveResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, &ResolveError{Category: FailureResolverUnavailable, Message: "resolver response invalid"}
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return nil, &ResolveError{Category: FailureResolutionDenied, Message: "credential resolution denied"}
	}
	if resp.StatusCode >= 300 || out.Error != "" {
		category := out.Error
		if category == "" {
			category = mapHTTPFailure(resp.StatusCode)
		}
		msg := out.Message
		if msg == "" {
			msg = sanitizedCategoryMessage(category)
		}
		return nil, &ResolveError{Category: category, Message: msg}
	}
	if len(out.Secrets) == 0 {
		return nil, &ResolveError{Category: FailureNotConfigured, Message: "integration credential not configured"}
	}
	return &Resolved{
		Source:            out.CredentialSource,
		ConnectionID:      out.ConnectionID,
		CredentialVersion: out.CredentialVersion,
		Provider:          out.Provider,
		IntegrationType:   out.IntegrationType,
		Environment:       out.Environment,
		Config:            out.Config,
		Secrets:           out.Secrets,
	}, nil
}

func mapHTTPFailure(status int) string {
	switch status {
	case http.StatusNotFound, http.StatusBadRequest:
		return FailureNotConfigured
	case http.StatusForbidden:
		return FailureResolutionDenied
	case http.StatusServiceUnavailable, http.StatusBadGateway, http.StatusGatewayTimeout:
		return FailureResolverUnavailable
	default:
		return FailureNotConfigured
	}
}

func sanitizedCategoryMessage(category string) string {
	switch category {
	case FailureDisabled:
		return "assigned integration credential is disabled"
	case FailureDecryptionFailed:
		return "credential decryption failed"
	case FailureProviderAuth:
		return "provider authentication failed"
	case FailureResolutionDenied:
		return "credential resolution denied"
	case FailureResolverUnavailable:
		return "credential resolver unavailable"
	default:
		return "integration credential not configured"
	}
}

// CredentialMeta returns sanitized session metadata safe for diagnostics.
func CredentialMeta(res *Resolved) map[string]any {
	if res == nil {
		return map[string]any{}
	}
	return map[string]any{
		"integrationId":     res.ConnectionID,
		"credentialSource":  res.Source,
		"credentialVersion": res.CredentialVersion,
		"provider":          res.Provider,
		"environment":       res.Environment,
	}
}

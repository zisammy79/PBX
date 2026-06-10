package session

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/pbx-platform/ai-media-gateway/internal/provider"
)

const OpenAIProviderID = provider.OpenAIProviderID

var allowedProviders = map[string]struct{}{
	provider.DeterministicProviderID: {},
	provider.OpenAIProviderID:        {},
}

var allowedAudioFormats = map[string]struct{}{
	"ulaw": {},
	"alaw": {},
}

// CreateRequest is the internal session contract shared with telephony-controller.
type CreateRequest struct {
	SessionID            string   `json:"sessionId"`
	TenantID             string   `json:"tenantId"`
	CallID               string   `json:"callId"`
	CorrelationID        string   `json:"correlationId"`
	AgentID              string   `json:"agentId"`
	AgentVersionID       string   `json:"agentVersionId"`
	Provider             string   `json:"provider"`
	Model                string   `json:"model,omitempty"`
	Voice                string   `json:"voice,omitempty"`
	Language             string   `json:"language,omitempty"`
	SystemInstructions   string   `json:"systemInstructions,omitempty"`
	OpeningMessage       string   `json:"openingMessage,omitempty"`
	AllowedTools         []string `json:"allowedTools,omitempty"`
	CredentialsEncrypted string   `json:"credentialsEncrypted,omitempty"`
	TransferExtension    string   `json:"transferExtension,omitempty"`
	AudioFormat          string   `json:"audioFormat"`
	LocalAddress         string   `json:"localAddress,omitempty"`
	RemoteAddress        string   `json:"remoteAddress,omitempty"`
}

// FieldError describes one validation failure.
type FieldError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

// ValidationError is returned for malformed session requests.
type ValidationError struct {
	Fields []FieldError `json:"fields"`
}

func (e *ValidationError) Error() string {
	if len(e.Fields) == 0 {
		return "validation failed"
	}
	return fmt.Sprintf("%s: %s", e.Fields[0].Field, e.Fields[0].Message)
}

// DecodeCreateRequest parses and validates a session create request.
func DecodeCreateRequest(r io.Reader) (CreateRequest, error) {
	dec := json.NewDecoder(r)
	dec.DisallowUnknownFields()
	var req CreateRequest
	if err := dec.Decode(&req); err != nil {
		return CreateRequest{}, err
	}
	var extra json.RawMessage
	if err := dec.Decode(&extra); err != io.EOF {
		return CreateRequest{}, fmt.Errorf("unexpected trailing JSON")
	}
	if err := req.Validate(); err != nil {
		return CreateRequest{}, err
	}
	req.AudioFormat = strings.ToLower(strings.TrimSpace(req.AudioFormat))
	return req, nil
}

func (r CreateRequest) Validate() error {
	var fields []FieldError
	add := func(field, msg string) {
		fields = append(fields, FieldError{Field: field, Message: msg})
	}
	if strings.TrimSpace(r.TenantID) == "" {
		add("tenantId", "required")
	}
	if strings.TrimSpace(r.CallID) == "" {
		add("callId", "required")
	}
	if strings.TrimSpace(r.SessionID) == "" {
		add("sessionId", "required")
	}
	if strings.TrimSpace(r.CorrelationID) == "" {
		add("correlationId", "required")
	}
	if strings.TrimSpace(r.AgentID) == "" {
		add("agentId", "required")
	}
	if strings.TrimSpace(r.AgentVersionID) == "" {
		add("agentVersionId", "required")
	}
	if strings.TrimSpace(r.Provider) == "" {
		add("provider", "required")
	} else if _, ok := allowedProviders[r.Provider]; !ok {
		add("provider", fmt.Sprintf("unsupported provider %q", r.Provider))
	} else if r.Provider == OpenAIProviderID {
		if strings.TrimSpace(r.CredentialsEncrypted) != "" {
			add("credentialsEncrypted", "must not be supplied; credentials are resolved internally")
		}
	}
	format := strings.ToLower(strings.TrimSpace(r.AudioFormat))
	if format == "" {
		add("audioFormat", "required")
	} else if _, ok := allowedAudioFormats[format]; !ok {
		add("audioFormat", fmt.Sprintf("unsupported audio format %q", r.AudioFormat))
	}
	if len(fields) > 0 {
		return &ValidationError{Fields: fields}
	}
	return nil
}

package provider

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/pbx-platform/ai-media-gateway/internal/crypto"
)

const OpenAIProviderID = "openai"

// OpenAIRealtimeConfig holds non-secret session configuration.
type OpenAIRealtimeConfig struct {
	APIKey             string
	Model              string
	Voice              string
	RealtimeURL        string
	SystemInstructions string
	OpeningMessage     string
	AllowedTools       []string
	TenantID           string
	PlatformSessionID  string
	CallID             string
}

// OpenAIRealtimeSession is an active OpenAI Realtime WebSocket session.
type OpenAIRealtimeSession struct {
	ID        string
	Config    OpenAIRealtimeConfig
	conn      *websocket.Conn
	cancel    context.CancelFunc
	mu        sync.Mutex
	closed    bool
	response  bool
	usage     map[string]float64
	onAudio   func(ulaw []byte)
	onSpeech  func()
	onTool    func(*ToolInvocation)
	onError   func(string)
}

// OpenAIRealtimeProvider manages OpenAI Realtime connections.
type OpenAIRealtimeProvider struct {
	masterKey string
}

func NewOpenAIRealtimeProvider() *OpenAIRealtimeProvider {
	return &OpenAIRealtimeProvider{masterKey: os.Getenv("ENCRYPTION_MASTER_KEY")}
}

func (p *OpenAIRealtimeProvider) Manifest() CapabilityManifest {
	return CapabilityManifest{
		ProviderID:                  OpenAIProviderID,
		Models:                      supportedOpenAIModels(),
		AudioInputFormats:           []string{"ulaw", "g711_ulaw"},
		AudioOutputFormats:          []string{"ulaw", "g711_ulaw"},
		SampleRates:                 []int{8000},
		NativeVoiceActivitySupport:  true,
		InterruptionSupport:         true,
		ToolCallingSupport:          true,
		SessionDurationLimitSeconds: 3600,
		UsageFields:                 []string{"input_audio_tokens", "output_audio_tokens", "total_tokens"},
		HealthStatus:                "unknown",
	}
}

func supportedOpenAIModels() []string {
	if raw := strings.TrimSpace(os.Getenv("OPENAI_REALTIME_MODELS")); raw != "" {
		return strings.Split(raw, ",")
	}
	return []string{"gpt-4o-realtime-preview", "gpt-4o-mini-realtime-preview"}
}

func (p *OpenAIRealtimeProvider) ConnectFromRequest(
	ctx context.Context,
	encryptedCreds string,
	model, voice, instructions, opening string,
	allowedTools []string,
	tenantID, platformSessionID, callID string,
	onAudio func([]byte),
	onSpeech func(),
	onTool func(*ToolInvocation),
	onError func(string),
) (*OpenAIRealtimeSession, error) {
	if p.masterKey == "" {
		return nil, fmt.Errorf("ENCRYPTION_MASTER_KEY not configured")
	}
	apiKey, err := crypto.ParseOpenAICredentials(encryptedCreds, p.masterKey)
	if err != nil {
		return nil, fmt.Errorf("credentials: %w", err)
	}
	if strings.TrimSpace(model) == "" {
		model = strings.TrimSpace(os.Getenv("OPENAI_REALTIME_MODEL"))
		if model == "" {
			return nil, fmt.Errorf("model required")
		}
	}
	if strings.TrimSpace(voice) == "" {
		voice = strings.TrimSpace(os.Getenv("OPENAI_REALTIME_VOICE"))
		if voice == "" {
			voice = "alloy"
		}
	}
	baseURL := strings.TrimSpace(os.Getenv("OPENAI_REALTIME_URL"))
	if baseURL == "" {
		baseURL = "wss://api.openai.com/v1/realtime"
	}
	cfg := OpenAIRealtimeConfig{
		APIKey:             apiKey,
		Model:              model,
		Voice:              voice,
		RealtimeURL:        baseURL,
		SystemInstructions: instructions,
		OpeningMessage:     opening,
		AllowedTools:       allowedTools,
		TenantID:           tenantID,
		PlatformSessionID:  platformSessionID,
		CallID:             callID,
	}
	return p.connect(ctx, cfg, onAudio, onSpeech, onTool, onError)
}

func (p *OpenAIRealtimeProvider) connect(
	ctx context.Context,
	cfg OpenAIRealtimeConfig,
	onAudio func([]byte),
	onSpeech func(),
	onTool func(*ToolInvocation),
	onError func(string),
) (*OpenAIRealtimeSession, error) {
	wsURL := fmt.Sprintf("%s?model=%s", strings.TrimRight(cfg.RealtimeURL, "/"), cfg.Model)
	header := http.Header{}
	header.Set("Authorization", "Bearer "+cfg.APIKey)
	header.Set("OpenAI-Beta", "realtime=v1")

	dialer := websocket.Dialer{HandshakeTimeout: 15 * time.Second}
	conn, _, err := dialer.DialContext(ctx, wsURL, header)
	if err != nil {
		return nil, sanitizeProviderError(err)
	}

	sCtx, cancel := context.WithCancel(ctx)
	sess := &OpenAIRealtimeSession{
		ID:       fmt.Sprintf("oai-%d", time.Now().UnixNano()),
		Config:   cfg,
		conn:     conn,
		cancel:   cancel,
		usage:    map[string]float64{},
		onAudio:  onAudio,
		onSpeech: onSpeech,
		onTool:   onTool,
		onError:  onError,
	}

	if err := sess.sendSessionUpdate(); err != nil {
		conn.Close()
		cancel()
		return nil, err
	}

	go sess.readLoop(sCtx)
	return sess, nil
}

func (s *OpenAIRealtimeSession) sendSessionUpdate() error {
	tools := buildOpenAITools(s.Config.AllowedTools)
	instructions := s.Config.SystemInstructions
	if s.Config.OpeningMessage != "" {
		instructions = strings.TrimSpace(instructions + "\n\nOpening: " + s.Config.OpeningMessage)
	}
	payload := map[string]any{
		"type": "session.update",
		"session": map[string]any{
			"modalities":          []string{"text", "audio"},
			"instructions":        instructions,
			"voice":               s.Config.Voice,
			"input_audio_format":  "g711_ulaw",
			"output_audio_format": "g711_ulaw",
			"turn_detection": map[string]any{
				"type":                "server_vad",
				"threshold":           0.5,
				"prefix_padding_ms":   300,
				"silence_duration_ms": 500,
				"create_response":     true,
			},
			"tools": tools,
		},
	}
	return s.writeJSON(payload)
}

func buildOpenAITools(allowed []string) []map[string]any {
	names := map[string]bool{}
	for _, t := range allowed {
		names[t] = true
	}
	if len(names) == 0 {
		names[ToolTransferCall] = true
		names[ToolEndCall] = true
	}
	var tools []map[string]any
	if names[ToolTransferCall] {
		tools = append(tools, map[string]any{
			"type":        "function",
			"name":        ToolTransferCall,
			"description": "Transfer the caller to a human extension",
			"parameters": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"extension": map[string]any{"type": "string", "description": "Extension number"},
				},
				"required": []string{"extension"},
			},
		})
	}
	if names[ToolEndCall] {
		tools = append(tools, map[string]any{
			"type":        "function",
			"name":        ToolEndCall,
			"description": "End the call politely",
			"parameters":  map[string]any{"type": "object", "properties": map[string]any{}},
		})
	}
	return tools
}

func (s *OpenAIRealtimeSession) writeJSON(v any) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed || s.conn == nil {
		return fmt.Errorf("session closed")
	}
	return s.conn.WriteJSON(v)
}

func (s *OpenAIRealtimeSession) AppendAudio(ulaw []byte) error {
	if len(ulaw) == 0 {
		return nil
	}
	encoded := base64.StdEncoding.EncodeToString(ulaw)
	return s.writeJSON(map[string]any{
		"type":  "input_audio_buffer.append",
		"audio": encoded,
	})
}

func (s *OpenAIRealtimeSession) CancelResponse() error {
	s.mu.Lock()
	s.response = false
	s.mu.Unlock()
	return s.writeJSON(map[string]any{"type": "response.cancel"})
}

func (s *OpenAIRealtimeSession) Close() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	conn := s.conn
	s.mu.Unlock()
	if conn != nil {
		_ = conn.WriteMessage(websocket.CloseMessage, websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
		_ = conn.Close()
	}
	s.cancel()
}

func (s *OpenAIRealtimeSession) Usage() map[string]float64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := map[string]float64{}
	for k, v := range s.usage {
		out[k] = v
	}
	return out
}

func (s *OpenAIRealtimeSession) readLoop(ctx context.Context) {
	defer s.Close()
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		_, raw, err := s.conn.ReadMessage()
		if err != nil {
			if s.onError != nil && !s.closed {
				s.onError(sanitizeProviderError(err).Error())
			}
			return
		}
		s.handleEvent(raw)
	}
}

func (s *OpenAIRealtimeSession) handleEvent(raw []byte) {
	var envelope struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return
	}
	switch envelope.Type {
	case "input_audio_buffer.speech_started":
		s.mu.Lock()
		s.response = false
		s.mu.Unlock()
		if s.onSpeech != nil {
			s.onSpeech()
		}
	case "response.created":
		s.mu.Lock()
		s.response = true
		s.mu.Unlock()
	case "response.audio.delta":
		var evt struct {
			Delta string `json:"delta"`
		}
		if json.Unmarshal(raw, &evt) != nil || evt.Delta == "" {
			return
		}
		audio, err := base64.StdEncoding.DecodeString(evt.Delta)
		if err != nil || len(audio) == 0 {
			return
		}
		if s.onAudio != nil {
			s.onAudio(audio)
		}
	case "response.cancelled", "response.done":
		s.mu.Lock()
		s.response = false
		s.mu.Unlock()
	case "response.function_call_arguments.done":
		var evt struct {
			Name      string `json:"name"`
			Arguments string `json:"arguments"`
			CallID    string `json:"call_id"`
		}
		if json.Unmarshal(raw, &evt) != nil || evt.Name == "" {
			return
		}
		args := map[string]any{}
		_ = json.Unmarshal([]byte(evt.Arguments), &args)
		if s.onTool != nil {
			s.onTool(&ToolInvocation{
				InvocationID:   evt.CallID,
				SessionID:      s.Config.PlatformSessionID,
				TenantID:       s.Config.TenantID,
				ToolName:       evt.Name,
				Arguments:      args,
				IdempotencyKey: fmt.Sprintf("%s:%s", s.Config.PlatformSessionID, evt.CallID),
				CreatedAt:      time.Now().UTC(),
			})
		}
	case "response.output_item.done":
		var evt struct {
			Item struct {
				Type string `json:"type"`
				Name string `json:"name"`
			} `json:"item"`
		}
		if json.Unmarshal(raw, &evt) == nil && evt.Item.Type == "function_call" && evt.Item.Name != "" {
			// Some protocol versions emit here; arguments handled in function_call_arguments.done
		}
	case "rate_limits.updated":
		slog.Debug("openai rate limits updated")
	case "error":
		var evt struct {
			Error struct {
				Message string `json:"message"`
				Code    string `json:"code"`
			} `json:"error"`
		}
		if json.Unmarshal(raw, &evt) == nil && s.onError != nil {
			s.onError(sanitizeOpenAIError(evt.Error.Message, evt.Error.Code))
		}
	case "response.completed":
		var evt struct {
			Response struct {
				Usage struct {
					InputTokens  int `json:"input_tokens"`
					OutputTokens int `json:"output_tokens"`
					TotalTokens  int `json:"total_tokens"`
				} `json:"usage"`
			} `json:"response"`
		}
		if json.Unmarshal(raw, &evt) == nil {
			s.mu.Lock()
			s.usage["input_tokens"] += float64(evt.Response.Usage.InputTokens)
			s.usage["output_tokens"] += float64(evt.Response.Usage.OutputTokens)
			s.usage["total_tokens"] += float64(evt.Response.Usage.TotalTokens)
			s.mu.Unlock()
		}
	}
}

func sanitizeProviderError(err error) error {
	msg := err.Error()
	if strings.Contains(msg, "401") || strings.Contains(strings.ToLower(msg), "unauthorized") {
		return fmt.Errorf("provider authentication failed")
	}
	if strings.Contains(msg, "429") {
		return fmt.Errorf("provider rate limit exceeded")
	}
	return fmt.Errorf("provider connection failed")
}

func sanitizeOpenAIError(message, code string) string {
	_ = code
	if message == "" {
		return "provider error"
	}
	lower := strings.ToLower(message)
	if strings.Contains(lower, "api key") || strings.Contains(lower, "auth") {
		return "provider authentication failed"
	}
	if strings.Contains(lower, "rate") {
		return "provider rate limit exceeded"
	}
	return "provider error"
}

// ContractTestManifest returns provider metadata for contract verification without credentials.
func ContractTestManifest() CapabilityManifest {
	return NewOpenAIRealtimeProvider().Manifest()
}

package provider

import (
	"context"
	"fmt"
	"sync"
	"time"
)

const DeterministicProviderID = "deterministic-test"

type CapabilityManifest struct {
	ProviderID                  string   `json:"providerId"`
	Models                      []string `json:"models"`
	AudioInputFormats           []string `json:"audioInputFormats"`
	AudioOutputFormats          []string `json:"audioOutputFormats"`
	SampleRates                 []int    `json:"sampleRates"`
	NativeVoiceActivitySupport  bool     `json:"nativeVoiceActivitySupport"`
	InterruptionSupport         bool     `json:"interruptionSupport"`
	ToolCallingSupport          bool     `json:"toolCallingSupport"`
	SessionDurationLimitSeconds int      `json:"sessionDurationLimitSeconds"`
	UsageFields                 []string `json:"usageFields"`
	HealthStatus                string   `json:"healthStatus"`
}

type AudioFrame struct {
	PCM16        []byte
	SampleRateHz int
	TimestampMs  int64
}

type Session struct {
	ID                string
	Model             string
	TenantID          string
	PlatformSessionID string
	StartedAt         time.Time
	FramesIn          int
	FramesOut         int
	Cancelled         bool
}

type DeterministicProvider struct {
	mu       sync.Mutex
	sessions map[string]*Session
	behavior map[string]*behaviorState
	delay    time.Duration
}

func NewDeterministicProvider() *DeterministicProvider {
	return &DeterministicProvider{
		sessions: make(map[string]*Session),
		behavior: make(map[string]*behaviorState),
		delay:    5 * time.Millisecond,
	}
}

func (p *DeterministicProvider) Manifest() CapabilityManifest {
	return CapabilityManifest{
		ProviderID:                  DeterministicProviderID,
		Models:                      []string{"deterministic-v1", DeterministicBehaviorModel},
		AudioInputFormats:           []string{"ulaw", "pcm16"},
		AudioOutputFormats:          []string{"ulaw", "pcm16"},
		SampleRates:                 []int{8000, 16000, 24000},
		NativeVoiceActivitySupport:  true,
		InterruptionSupport:         true,
		ToolCallingSupport:          true,
		SessionDurationLimitSeconds: 3600,
		UsageFields:                 []string{"ai_realtime_session_seconds", "ai_input_audio_seconds", "ai_output_audio_seconds", "ai_tool_calls"},
		HealthStatus:                "healthy",
	}
}

func (p *DeterministicProvider) Connect(_ context.Context, model string) (*Session, error) {
	return p.ConnectSession(model, "", "")
}

func (p *DeterministicProvider) ConnectSession(model, tenantID, platformSessionID string) (*Session, error) {
	id := fmt.Sprintf("det-%d", time.Now().UnixNano())
	s := &Session{
		ID:                id,
		Model:             model,
		TenantID:          tenantID,
		PlatformSessionID: platformSessionID,
		StartedAt:         time.Now().UTC(),
	}
	p.mu.Lock()
	p.sessions[id] = s
	p.mu.Unlock()
	if p.IsBehaviorModel(model) {
		p.initBehavior(id, tenantID, platformSessionID)
	}
	return s, nil
}

func (p *DeterministicProvider) Disconnect(sessionID string) {
	p.mu.Lock()
	delete(p.sessions, sessionID)
	delete(p.behavior, sessionID)
	p.mu.Unlock()
}

func (p *DeterministicProvider) SendAudio(sessionID string, frame AudioFrame) (response AudioFrame, transcript string, err error) {
	p.mu.Lock()
	s, ok := p.sessions[sessionID]
	if !ok {
		p.mu.Unlock()
		return AudioFrame{}, "", fmt.Errorf("unknown session")
	}
	s.FramesIn++
	if s.Cancelled {
		s.Cancelled = false
	}
	p.mu.Unlock()

	if p.IsBehaviorModel(s.Model) {
		return AudioFrame{PCM16: nil, SampleRateHz: 8000}, fmt.Sprintf("behavior-input-%d", s.FramesIn), nil
	}

	time.Sleep(p.delay)
	transcript = fmt.Sprintf("deterministic-input-frame-%d", len(frame.PCM16))
	out := make([]byte, UlawFrameBytes)
	for i := range out {
		out[i] = byte((i + s.FramesIn) % 256)
	}
	p.mu.Lock()
	s.FramesOut++
	p.mu.Unlock()
	return AudioFrame{PCM16: out, SampleRateHz: frame.SampleRateHz, TimestampMs: time.Now().UnixMilli()}, transcript, nil
}

func (p *DeterministicProvider) CancelResponse(sessionID string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	s, ok := p.sessions[sessionID]
	if !ok {
		return false
	}
	s.Cancelled = true
	return true
}

func (p *DeterministicProvider) SimulateFailure(sessionID string) error {
	p.Disconnect(sessionID)
	return fmt.Errorf("simulated provider failure")
}

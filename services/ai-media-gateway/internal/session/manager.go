package session

import (
	"context"
	"crypto/subtle"
	"fmt"
	"net"
	"os"
	"sync"
	"time"

	"github.com/pbx-platform/ai-media-gateway/internal/credentials"
	"github.com/pbx-platform/ai-media-gateway/internal/media"
	"github.com/pbx-platform/ai-media-gateway/internal/provider"
)

type CreateResponse struct {
	RTPHost string `json:"rtpHost"`
	RTPPort int    `json:"rtpPort"`
}

type MediaStats struct {
	SessionID            string         `json:"sessionId"`
	Codec                string         `json:"codec"`
	FrameSize            int            `json:"frameSize"`
	RTPPacketsReceived   uint64         `json:"rtpPacketsReceived"`
	RTPBytesReceived     uint64         `json:"rtpBytesReceived"`
	RTPPacketsSent       uint64         `json:"rtpPacketsSent"`
	RTPBytesSent         uint64         `json:"rtpBytesSent"`
	FirstInboundMediaMs  int64          `json:"firstInboundMediaMs,omitempty"`
	FirstOutboundMediaMs int64          `json:"firstOutboundMediaMs,omitempty"`
	SessionDurationMs    int64          `json:"sessionDurationMs"`
	Provider             string         `json:"provider"`
	Connected            bool           `json:"connected"`
	Behavior             map[string]any `json:"behavior,omitempty"`
}

type Manager struct {
	mu            sync.Mutex
	sessions      map[string]*liveSession
	det           *provider.DeterministicProvider
	token         string
	rtpBindHost   string
	rtpAdvertHost string
	resolver      *credentials.Resolver
}

type liveSession struct {
	id          string
	tenantID    string
	callID      string
	provider    string
	model       string
	codec       string
	bridge      *media.RTPBridge
	prov        *provider.DeterministicProvider
	sess        *provider.Session
	openai      *openaiRuntime
	credential  *credentials.Resolved
	cancel      context.CancelFunc
	ctx         context.Context
	createdAt   time.Time
	connected   bool
	behavior    *behaviorRuntime
	diagnostics map[string]any
	createReq   CreateRequest
}

func NewManager(token string) *Manager {
	bind := os.Getenv("RTP_BIND_HOST")
	if bind == "" {
		bind = "0.0.0.0"
	}
	advert := os.Getenv("RTP_ADVERTISE_HOST")
	if advert == "" {
		advert = "127.0.0.1"
	}
	return &Manager{
		sessions:      make(map[string]*liveSession),
		det:           provider.NewDeterministicProvider(),
		token:         token,
		rtpBindHost:   bind,
		rtpAdvertHost: advert,
		resolver:      credentials.NewResolverFromEnv(),
	}
}

func (m *Manager) Authorize(header string) bool {
	if m.token == "" {
		return true
	}
	const prefix = "Bearer "
	if len(header) <= len(prefix) || header[:len(prefix)] != prefix {
		return false
	}
	provided := header[len(prefix):]
	return subtle.ConstantTimeCompare([]byte(provided), []byte(m.token)) == 1
}

func (m *Manager) ResolverHealth(ctx context.Context) error {
	if m.resolver == nil {
		return fmt.Errorf("credential resolver not configured")
	}
	return m.resolver.Health(ctx)
}

func (m *Manager) Create(ctx context.Context, req CreateRequest) (*CreateResponse, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if _, ok := m.sessions[req.SessionID]; ok {
		return nil, fmt.Errorf("session exists")
	}

	sCtx, cancel := context.WithCancel(context.Background())
	var detSess *provider.Session
	var err error
	if req.Provider == provider.DeterministicProviderID {
		model := req.Model
		if model == "" {
			model = "deterministic-v1"
		}
		detSess, err = m.det.ConnectSession(model, req.TenantID, req.SessionID)
		if err != nil {
			cancel()
			return nil, err
		}
	} else if req.Provider == provider.OpenAIProviderID {
		// OpenAI session starts after RTP bridge is ready (SetPeer).
	}

	ls := &liveSession{
		id:          req.SessionID,
		tenantID:    req.TenantID,
		callID:      req.CallID,
		provider:    req.Provider,
		model:       req.Model,
		codec:       req.AudioFormat,
		prov:        m.det,
		sess:        detSess,
		cancel:      cancel,
		ctx:         sCtx,
		createdAt:   time.Now().UTC(),
		diagnostics: map[string]any{},
		createReq:   req,
	}
	var bridge *media.RTPBridge
	bridge, err = media.NewRTPBridge(m.rtpBindHost, 0, func(payload []byte) {
		if ls.provider == provider.OpenAIProviderID {
			m.handleOpenAIInbound(ls, payload)
			return
		}
		if ls.sess == nil {
			return
		}
		if m.det.IsBehaviorModel(ls.sess.Model) {
			m.handleBehaviorInbound(ls, payload)
			return
		}
		frame := provider.AudioFrame{PCM16: payload, SampleRateHz: 8000}
		out, _, err := m.det.SendAudio(ls.sess.ID, frame)
		if err != nil {
			return
		}
		if len(out.PCM16) > 0 && bridge != nil {
			bridge.SendULaw(out.PCM16)
		}
	})
	if err != nil {
		cancel()
		return nil, err
	}
	ls.bridge = bridge
	ls.connected = true
	m.sessions[req.SessionID] = ls

	return &CreateResponse{RTPHost: m.rtpAdvertHost, RTPPort: bridge.Port()}, nil
}

func (m *Manager) SetPeer(sessionID, peerAddress string) error {
	m.mu.Lock()
	ls, ok := m.sessions[sessionID]
	m.mu.Unlock()
	if !ok || ls.bridge == nil {
		return fmt.Errorf("session not found")
	}
	addr, err := net.ResolveUDPAddr("udp", peerAddress)
	if err != nil {
		return err
	}
	ls.bridge.SetRemote(addr)
	if ls.provider == provider.OpenAIProviderID {
		if err := m.resolveOpenAICredential(ls, ls.createReq); err != nil {
			return err
		}
		if err := m.startOpenAISession(ls, ls.createReq); err != nil {
			return err
		}
		return nil
	}
	if ls.sess == nil {
		return nil
	}
	if m.det.IsBehaviorModel(ls.sess.Model) {
		go m.startBehaviorResponse(ls)
		return nil
	}
	go m.playDeterministicOpening(ls, ls.bridge, "")
	return nil
}

func (m *Manager) playDeterministicOpening(ls *liveSession, bridge *media.RTPBridge, opening string) {
	pacer := media.NewOutputPacer(func(frame []byte) {
		bridge.SendULawFrame(frame)
	})
	pacer.Start(ls.ctx)
	defer pacer.Cancel()
	frames := 200
	if opening != "" {
		frames = 250
	}
	for i := 0; i < frames; i++ {
		select {
		case <-ls.ctx.Done():
			return
		default:
			frame := provider.AudioFrame{PCM16: make([]byte, media.UlawFrameBytes), SampleRateHz: 8000}
			out, _, err := m.det.SendAudio(ls.sess.ID, frame)
			if err != nil || len(out.PCM16) == 0 {
				continue
			}
			pacer.EnqueuePayload(out.PCM16)
		}
		time.Sleep(time.Duration(media.UlawFrameMs) * time.Millisecond)
	}
}

func (m *Manager) Stats(sessionID string) (*MediaStats, bool) {
	m.mu.Lock()
	ls, ok := m.sessions[sessionID]
	m.mu.Unlock()
	if !ok || ls.bridge == nil {
		return nil, false
	}
	rxP, txP, rxB, txB, firstIn, firstOut := ls.bridge.StatsDetail()
	stats := &MediaStats{
		SessionID:            sessionID,
		Codec:                ls.codec,
		FrameSize:            media.UlawFrameBytes,
		RTPPacketsReceived:   rxP,
		RTPBytesReceived:     rxB,
		RTPPacketsSent:       txP,
		RTPBytesSent:         txB,
		FirstInboundMediaMs:  firstIn,
		FirstOutboundMediaMs: firstOut,
		SessionDurationMs:    time.Since(ls.createdAt).Milliseconds(),
		Provider:             ls.provider,
		Connected:            ls.connected,
	}
	if b, ok := m.BehaviorStats(sessionID); ok {
		stats.Behavior = b
	}
	return stats, true
}

func (m *Manager) Close(sessionID string) {
	m.mu.Lock()
	ls, ok := m.sessions[sessionID]
	delete(m.sessions, sessionID)
	m.mu.Unlock()
	if !ok {
		return
	}
	m.StopBehaviorOutput(sessionID)
	m.closeOpenAI(ls)
	ls.cancel()
	if ls.bridge != nil {
		ls.bridge.Close()
	}
	if ls.sess != nil {
		m.det.Disconnect(ls.sess.ID)
	}
}

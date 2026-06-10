package session

import (
	"log/slog"
	"sync"
	"time"

	"github.com/pbx-platform/ai-media-gateway/internal/credentials"
	"github.com/pbx-platform/ai-media-gateway/internal/media"
	"github.com/pbx-platform/ai-media-gateway/internal/provider"
)

type openaiRuntime struct {
	mu       sync.Mutex
	pacer    *media.OutputPacer
	sess     *provider.OpenAIRealtimeSession
	usage    map[string]float64
	toolSent bool
}

func (m *Manager) startOpenAISession(ls *liveSession, req CreateRequest) error {
	if ls.credential == nil {
		return &credentials.ResolveError{Category: credentials.FailureNotConfigured, Message: "integration credential not configured"}
	}
	res := ls.credential
	oai := provider.NewOpenAIRealtimeProvider()

	rt := &openaiRuntime{}
	ls.openai = rt

	onAudio := func(ulaw []byte) {
		rt.mu.Lock()
		pacer := rt.pacer
		rt.mu.Unlock()
		if pacer != nil {
			pacer.EnqueuePayload(ulaw)
		}
	}
	onSpeech := func() {
		rt.mu.Lock()
		pacer := rt.pacer
		rt.mu.Unlock()
		if pacer != nil {
			pacer.Cancel()
		}
		if rt.sess != nil {
			_ = rt.sess.CancelResponse()
		}
		ls.diagnostics["openai"] = map[string]any{"bargeIn": time.Now().UTC().Format(time.RFC3339Nano)}
	}
	onTool := func(inv *provider.ToolInvocation) {
		rt.mu.Lock()
		if rt.toolSent {
			rt.mu.Unlock()
			return
		}
		rt.toolSent = true
		rt.mu.Unlock()
		m.notifyTool(ls, inv)
	}
	onError := func(msg string) {
		slog.Warn("openai session error", "sessionId", ls.id, "error", msg)
		ls.diagnostics["openaiError"] = msg
	}

	model := req.Model
	if model == "" {
		if v, ok := res.Config["model"].(string); ok {
			model = v
		}
	}
	voice := req.Voice
	if voice == "" {
		if v, ok := res.Config["voice"].(string); ok {
			voice = v
		}
	}
	realtimeURL := ""
	if v, ok := res.Config["realtimeUrl"].(string); ok {
		realtimeURL = v
	}

	sess, err := oai.ConnectFromResolved(
		ls.ctx,
		res.Secrets,
		model,
		voice,
		realtimeURL,
		req.SystemInstructions,
		req.OpeningMessage,
		req.AllowedTools,
		req.TenantID,
		req.SessionID,
		req.CallID,
		onAudio,
		onSpeech,
		onTool,
		onError,
	)
	if err != nil {
		return err
	}
	rt.sess = sess
	rt.pacer = media.NewOutputPacer(func(frame []byte) {
		if ls.bridge != nil {
			ls.bridge.SendULawFrame(frame)
		}
	})
	rt.pacer.Start(ls.ctx)
	diag := credentials.CredentialMeta(res)
	diag["connectedAt"] = time.Now().UTC().Format(time.RFC3339Nano)
	ls.diagnostics["openai"] = diag
	ls.diagnostics["credential"] = credentials.CredentialMeta(res)
	return nil
}

func (m *Manager) resolveOpenAICredential(ls *liveSession, req CreateRequest) error {
	if m.resolver == nil {
		return &credentials.ResolveError{Category: credentials.FailureResolverUnavailable, Message: "credential resolver not configured"}
	}
	res, err := m.resolver.ResolveAI(ls.ctx, req.TenantID, "openai", "default")
	if err != nil {
		return err
	}
	ls.credential = res
	return nil
}

func (m *Manager) handleOpenAIInbound(ls *liveSession, payload []byte) {
	if ls.openai == nil || ls.openai.sess == nil || len(payload) == 0 {
		return
	}
	_ = ls.openai.sess.AppendAudio(payload)
}

func (m *Manager) closeOpenAI(ls *liveSession) {
	if ls.openai == nil {
		return
	}
	ls.openai.mu.Lock()
	if ls.openai.pacer != nil {
		ls.openai.pacer.Cancel()
	}
	if ls.openai.sess != nil {
		ls.openai.usage = ls.openai.sess.Usage()
		ls.openai.sess.Close()
	}
	ls.openai.mu.Unlock()
	if len(ls.openai.usage) > 0 {
		ls.diagnostics["openaiUsage"] = ls.openai.usage
	}
	ls.credential = nil
}

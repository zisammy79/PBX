package session

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/pbx-platform/ai-media-gateway/internal/media"
	"github.com/pbx-platform/ai-media-gateway/internal/provider"
)

type behaviorRuntime struct {
	mu          sync.Mutex
	pacer       *media.OutputPacer
	responding  bool
	interrupted bool
	secondStart bool
	toolSent    bool
	diagnostics provider.BehaviorDiagnostics
}

func (m *Manager) startBehaviorResponse(ls *liveSession) {
	if ls.sess == nil || !m.det.IsBehaviorModel(ls.sess.Model) {
		return
	}
	rt := &behaviorRuntime{}
	ls.behavior = rt
	rt.pacer = media.NewOutputPacer(func(frame []byte) {
		if ls.bridge != nil {
			ls.bridge.SendULawFrame(frame)
		}
		m.det.NoteResponseFrameSent(ls.sess.ID)
	})
	rt.pacer.Start(ls.ctx)
	rt.responding = true
	_, frames := m.det.BeginLongResponse(ls.sess.ID)
	rt.pacer.EnqueueFrames(frames)
	ls.diagnostics["behavior"] = map[string]any{"phase": provider.SessionPhaseResponding}
}

func (m *Manager) handleBehaviorInbound(ls *liveSession, payload []byte) {
	if ls.sess == nil || ls.behavior == nil || len(payload) == 0 {
		return
	}
	rt := ls.behavior
	rt.mu.Lock()
	if !rt.responding || rt.interrupted {
		rt.mu.Unlock()
		m.maybeEmitBehaviorTool(ls)
		return
	}
	rt.mu.Unlock()

	if !m.det.NoteInboundDuringResponse(ls.sess.ID) {
		return
	}
	rt.mu.Lock()
	if rt.interrupted {
		rt.mu.Unlock()
		return
	}
	rt.interrupted = true
	rt.responding = false
	pacer := rt.pacer
	rt.mu.Unlock()

	discarded := 0
	if pacer != nil {
		discarded = pacer.Cancel()
	}
	m.det.CancelResponse(ls.sess.ID)
	diag := m.det.InterruptResponse(ls.sess.ID, discarded)
	rt.mu.Lock()
	rt.diagnostics = diag
	ls.diagnostics["behavior"] = behaviorDiagMap(diag)
	rt.mu.Unlock()

	rt.mu.Lock()
	if !rt.secondStart {
		rt.secondStart = true
		rt.responding = true
		rt.pacer = media.NewOutputPacer(func(frame []byte) {
			if ls.bridge != nil {
				ls.bridge.SendULawFrame(frame)
			}
			m.det.NoteResponseFrameSent(ls.sess.ID)
		})
		rt.pacer.Start(ls.ctx)
		frames := m.det.BeginSecondResponse(ls.sess.ID)
		rt.pacer.EnqueueFrames(frames)
	}
	rt.mu.Unlock()
}

func (m *Manager) maybeEmitBehaviorTool(ls *liveSession) {
	if ls.sess == nil || ls.behavior == nil {
		return
	}
	rt := ls.behavior
	rt.mu.Lock()
	if rt.toolSent {
		rt.mu.Unlock()
		return
	}
	rt.mu.Unlock()

	if inv := m.det.NoteSecondTurnInput(ls.sess.ID); inv != nil {
		rt.mu.Lock()
		rt.toolSent = true
		rt.mu.Unlock()
		ls.diagnostics["behavior"] = behaviorDiagMap(m.det.BehaviorDiagnostics(ls.sess.ID))
		m.notifyTool(ls, inv)
	}
}

func behaviorDiagMap(d provider.BehaviorDiagnostics) map[string]any {
	return map[string]any{
		"responseStartedAt":       d.ResponseStartedAt,
		"interruptionDetectedAt":  d.InterruptionDetectedAt,
		"cancelRequestedAt":       d.CancelRequestedAt,
		"cancelAcknowledgedAt":    d.CancelAcknowledgedAt,
		"queuedFramesDiscarded":   d.QueuedFramesDiscarded,
		"oldResponseFramesSent":   d.OldResponseFramesSent,
		"secondTurnStartedAt":     d.SecondTurnStartedAt,
		"activeResponseId":        d.ActiveResponseID,
		"turn":                    d.Turn,
		"phase":                   d.Phase,
		"pendingToolName":         d.PendingToolName,
	}
}

func (m *Manager) notifyTool(ls *liveSession, inv *provider.ToolInvocation) {
	base := os.Getenv("TELEPHONY_CONTROLLER_URL")
	if base == "" {
		base = "http://telephony-controller:8090"
	}
	body, _ := json.Marshal(map[string]any{
		"invocationId":   inv.InvocationID,
		"sessionId":      inv.SessionID,
		"tenantId":       inv.TenantID,
		"callId":         ls.callID,
		"toolName":       inv.ToolName,
		"arguments":      inv.Arguments,
		"idempotencyKey": inv.IdempotencyKey,
		"createdAt":      inv.CreatedAt.Format(time.RFC3339Nano),
	})
	req, err := http.NewRequestWithContext(context.Background(), http.MethodPost, base+"/internal/v1/ai/tools", bytes.NewReader(body))
	if err != nil {
		slog.Warn("tool notify build failed", "error", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	if m.token != "" {
		req.Header.Set("Authorization", "Bearer "+m.token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		slog.Warn("tool notify failed", "error", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		slog.Warn("tool notify rejected", "status", resp.StatusCode)
	}
}

func (m *Manager) BehaviorStats(sessionID string) (map[string]any, bool) {
	m.mu.Lock()
	ls, ok := m.sessions[sessionID]
	m.mu.Unlock()
	if !ok || ls.sess == nil {
		return nil, false
	}
	d := m.det.BehaviorDiagnostics(ls.sess.ID)
	out := behaviorDiagMap(d)
	if ls.behavior != nil {
		ls.behavior.mu.Lock()
		out["toolSent"] = ls.behavior.toolSent
		ls.behavior.mu.Unlock()
	}
	return out, true
}

func (m *Manager) StopBehaviorOutput(sessionID string) {
	m.mu.Lock()
	ls, ok := m.sessions[sessionID]
	m.mu.Unlock()
	if !ok || ls.behavior == nil {
		return
	}
	ls.behavior.mu.Lock()
	if ls.behavior.pacer != nil {
		ls.behavior.pacer.Cancel()
	}
	ls.behavior.responding = false
	ls.behavior.mu.Unlock()
}

func validateToolName(name string) error {
	switch name {
	case provider.ToolTransferCall, provider.ToolEndCall, provider.ToolHTTPWebhook:
		return nil
	default:
		return fmt.Errorf("unsupported tool %q", name)
	}
}

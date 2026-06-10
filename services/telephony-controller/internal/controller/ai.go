package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/CyCoreSystems/ari/v6"
	"github.com/CyCoreSystems/ari/v6/rid"
	"github.com/google/uuid"
	"github.com/pbx-platform/telephony-controller/internal/calls"
	"github.com/pbx-platform/telephony-controller/internal/repository"
)

type gatewaySessionRequest struct {
	SessionID            string   `json:"sessionId"`
	TenantID             string   `json:"tenantId"`
	CallID               string   `json:"callId"`
	CorrelationID        string   `json:"correlationId"`
	AgentID              string   `json:"agentId"`
	AgentVersionID       string   `json:"agentVersionId"`
	Provider             string   `json:"provider"`
	Model                string   `json:"model"`
	Voice                string   `json:"voice"`
	Language             string   `json:"language"`
	SystemInstructions   string   `json:"systemInstructions"`
	OpeningMessage       string   `json:"openingMessage"`
	AllowedTools         []string `json:"allowedTools"`
	CredentialsEncrypted string   `json:"credentialsEncrypted,omitempty"`
	TransferExtension    string   `json:"transferExtension"`
	AudioFormat          string   `json:"audioFormat"`
}

type gatewaySessionResponse struct {
	RTPHost string `json:"rtpHost"`
	RTPPort int    `json:"rtpPort"`
}

type gatewayMediaStats struct {
	RTPPacketsReceived   uint64         `json:"rtpPacketsReceived"`
	RTPBytesReceived     uint64         `json:"rtpBytesReceived"`
	RTPPacketsSent       uint64         `json:"rtpPacketsSent"`
	RTPBytesSent         uint64         `json:"rtpBytesSent"`
	FirstInboundMediaMs  int64          `json:"firstInboundMediaMs"`
	FirstOutboundMediaMs int64          `json:"firstOutboundMediaMs"`
	SessionDurationMs    int64          `json:"sessionDurationMs"`
	Codec                string         `json:"codec"`
	Behavior             map[string]any `json:"behavior,omitempty"`
}

func (c *Controller) onAiStasisStart(ctx context.Context, channelID, tenantSlug, callerNum, routeNumber string) {
	if active, ok := c.registry.ByChannel(channelID); ok && active.IsAiCall {
		if !active.MarkEvent("ai-stasis-dup:" + channelID) {
			return
		}
	}

	agent, err := c.repo.LookupAiAgentByRoute(ctx, tenantSlug, routeNumber)
	if err != nil {
		slog.Error("ai agent lookup failed", "tenant", tenantSlug, "route", routeNumber, "error", err)
		c.hangup(channelID)
		return
	}

	fromExt, err := c.repo.LookupExtensionByTenantNumber(ctx, tenantSlug, callerNum)
	if err != nil {
		slog.Error("ai caller lookup failed", "tenant", tenantSlug, "caller", callerNum)
		c.hangup(channelID)
		return
	}

	callID := uuid.New()
	sessionID := uuid.New()
	correlationID := uuid.New()
	now := time.Now().UTC()

	active := &calls.ActiveCall{
		CallID:                  callID,
		TenantID:                fromExt.TenantID,
		CorrelationID:           correlationID,
		TenantSlug:              tenantSlug,
		CallerNumber:            callerNum,
		CalleeNumber:            routeNumber,
		State:                   calls.StateCreated,
		CallerChannelID:         channelID,
		IsAiCall:                true,
		AiSessionID:             sessionID,
		TransferExtensionNumber: agent.TransferNumber,
		CreatedAt:               now,
		ProcessedEvents:         map[string]bool{},
	}
	active.Transition(calls.StateRinging)
	c.registry.Put(active)

	rec := repository.CallRecord{
		ID:                callID,
		TenantID:          fromExt.TenantID,
		CorrelationID:     correlationID,
		Direction:         "internal",
		Status:            "ringing",
		FromExtensionID:   &fromExt.ID,
		CallerNumber:      callerNum,
		CalleeNumber:      routeNumber,
		AsteriskChannelID: channelID,
		StartedAt:         now,
	}
	_ = c.repo.CreateCall(ctx, rec)
	_ = c.repo.InsertCallLeg(ctx, fromExt.TenantID, callID, "caller", channelID, fromExt.AsteriskEndpointID)
	_ = c.repo.InsertCallEvent(ctx, fromExt.TenantID, callID, "CREATED", map[string]any{"source": "asterisk", "aiRoute": routeNumber})
	_ = c.repo.InsertCallEvent(ctx, fromExt.TenantID, callID, "RINGING", map[string]any{"source": "asterisk"})

	credsEnc, _, _ := c.repo.GetProviderCredentialsEncrypted(ctx, agent.TenantID, agent.ProviderConnectionID)
	_ = c.repo.CreateAiSession(ctx, repository.AiSessionRecord{
		ID:                   sessionID,
		TenantID:             agent.TenantID,
		CallID:               callID,
		AgentID:              agent.ID,
		AgentVersionID:       agent.ActiveVersionID,
		ProviderConnectionID: agent.ProviderConnectionID,
		ProviderType:         agent.Provider,
		CorrelationID:        correlationID,
	})

	if err := c.client.Channel().Answer(channelKey(channelID)); err != nil {
		slog.Error("ai answer failed", "error", err)
		c.finalizeAiCall(ctx, active, calls.StateFailed, "answer_failed", nil)
		return
	}

	bKey := ari.NewKey(ari.BridgeKey, rid.New(rid.Bridge))
	bridge, err := c.client.Bridge().Create(bKey, "mixing", bKey.ID)
	if err != nil {
		c.finalizeAiCall(ctx, active, calls.StateFailed, "bridge_create_failed", nil)
		return
	}
	active.BridgeID = bridge.ID()
	_ = c.repo.UpdateCallStatus(ctx, callID, "answered", map[string]any{"asterisk_bridge_id": bridge.ID(), "answered_at": now})
	if err := c.client.Bridge().AddChannel(bridgeKey(active.BridgeID), channelID); err != nil {
		slog.Error("ai bridge add caller failed", "error", err)
		c.finalizeAiCall(ctx, active, calls.StateFailed, "bridge_add_failed", nil)
		return
	}

	if c.cfg.AiGatewayURL == "" {
		c.finalizeAiCall(ctx, active, calls.StateFailed, "ai_gateway_not_configured", nil)
		return
	}

	gwResp, err := c.startGatewaySession(ctx, gatewaySessionRequest{
		SessionID:            sessionID.String(),
		TenantID:             agent.TenantID.String(),
		CallID:               callID.String(),
		CorrelationID:        correlationID.String(),
		AgentID:              agent.ID.String(),
		AgentVersionID:       agent.ActiveVersionID.String(),
		Provider:             agent.Provider,
		Model:                agent.Model,
		Voice:                agent.Voice,
		Language:             agent.Language,
		SystemInstructions:   agent.SystemInstructions,
		OpeningMessage:       agent.OpeningMessage,
		AllowedTools:         agent.AllowedTools,
		CredentialsEncrypted: credsEnc,
		TransferExtension:    agent.TransferNumber,
		AudioFormat:          "ulaw",
	})
	if err != nil {
		slog.Error("ai gateway session failed", "error", err)
		c.finalizeAiCall(ctx, active, calls.StateFailed, "ai_gateway_failed", nil)
		return
	}

	extHost := c.resolveGatewayRTPHost(gwResp.RTPHost, gwResp.RTPPort)
	mediaKey := ari.NewKey(ari.ChannelKey, rid.New(rid.Channel))
	mediaHandle, err := c.client.Channel().ExternalMedia(mediaKey, ari.ExternalMediaOptions{
		ExternalHost:   extHost,
		Format:         "ulaw",
		Encapsulation:  "rtp",
		Transport:      "udp",
		ConnectionType: "client",
		Direction:      "both",
	})
	if err != nil {
		slog.Error("external media create failed", "error", err, "host", extHost)
		c.finalizeAiCall(ctx, active, calls.StateFailed, "external_media_failed", nil)
		return
	}
	mediaID := mediaHandle.ID()
	if err := c.client.Bridge().AddChannel(bridgeKey(active.BridgeID), mediaID); err != nil {
		slog.Error("ai bridge add media failed", "error", err)
		c.hangup(mediaID)
		c.finalizeAiCall(ctx, active, calls.StateFailed, "bridge_media_failed", nil)
		return
	}

	active.AiMediaChannelID = mediaID
	active.CalleeChannelID = mediaID
	active.HadCalleeLeg = true
	c.registry.Put(active)
	_ = c.repo.InsertCallLeg(ctx, fromExt.TenantID, callID, "ai_media", mediaID, "ai-media-gateway")

	// Optional peer notify helps symmetric RTP; caller-originated media should still
	// reach the gateway in client mode when the bridge carries SIP RTP.
	if peer := c.resolveUnicastRTPPeer(mediaID); peer != "" {
		if err := c.notifyGatewayPeer(ctx, sessionID.String(), peer); err != nil {
			slog.Warn("ai gateway peer notify failed", "error", err, "peer", peer)
		}
		_ = c.repo.UpdateAiSessionState(ctx, sessionID, "CONNECTED", "active", map[string]any{
			"diagnostics": map[string]any{"asteriskMediaPeer": peer},
		})
	}

	connectedAt := time.Now().UTC()
	_ = c.repo.UpdateAiSessionState(ctx, sessionID, "CONNECTED", "active", map[string]any{
		"timing": map[string]any{"connectedAt": connectedAt.Format(time.RFC3339Nano)},
		"diagnostics": map[string]any{
			"transport":    "ari_external_media_rtp",
			"rtpHost":      gwResp.RTPHost,
			"rtpPort":      gwResp.RTPPort,
			"externalHost": extHost,
			"codec":        "ulaw",
		},
	})

	c.markAnsweredAndBridged(ctx, active)
	_ = c.repo.InsertCallEvent(ctx, fromExt.TenantID, callID, "BRIDGED", map[string]any{
		"bridgeId": active.BridgeID, "aiSessionId": sessionID.String(), "aiMediaChannelId": mediaID,
	})
}

func (c *Controller) finalizeAiCall(ctx context.Context, active *calls.ActiveCall, state, cause string, stats *gatewayMediaStats) {
	if active == nil {
		return
	}
	if !active.IsAiCall || active.AiSessionID == uuid.Nil {
		c.finalizeCall(ctx, active, state, cause)
		return
	}
	if active.TransferInProgress {
		return
	}
	if !active.MarkEvent("ai-finalized") {
		return
	}
	sessionID := active.AiSessionID
	if stats == nil {
		if s, err := c.fetchGatewayStats(ctx, sessionID.String()); err == nil {
			stats = s
		}
	}
	_ = c.closeGatewaySession(ctx, sessionID.String())

	now := time.Now().UTC()
	timing := map[string]any{"completedAt": now.Format(time.RFC3339Nano)}
	diagnostics := map[string]any{"failureCategory": cause}
	if stats != nil {
		diagnostics["media"] = map[string]any{
			"rtpPacketsReceived":   stats.RTPPacketsReceived,
			"rtpBytesReceived":     stats.RTPBytesReceived,
			"rtpPacketsSent":       stats.RTPPacketsSent,
			"rtpBytesSent":         stats.RTPBytesSent,
			"firstInboundMediaMs":  stats.FirstInboundMediaMs,
			"firstOutboundMediaMs": stats.FirstOutboundMediaMs,
			"sessionDurationMs":    stats.SessionDurationMs,
			"codec":                stats.Codec,
		}
		if stats.FirstInboundMediaMs > 0 {
			timing["firstInboundMediaAt"] = active.CreatedAt.Add(time.Duration(stats.FirstInboundMediaMs) * time.Millisecond).Format(time.RFC3339Nano)
		}
		if stats.FirstOutboundMediaMs > 0 {
			timing["firstOutboundMediaAt"] = active.CreatedAt.Add(time.Duration(stats.FirstOutboundMediaMs) * time.Millisecond).Format(time.RFC3339Nano)
		}
	}
	aiState := "COMPLETED"
	status := "completed"
	if state == calls.StateFailed {
		aiState = "FAILED"
		status = "failed"
	}
	_ = c.repo.UpdateAiSessionState(ctx, sessionID, aiState, status, map[string]any{
		"timing":      timing,
		"diagnostics": diagnostics,
		"ended_at":    now,
	})

	if active.BridgeID != "" {
		_ = c.client.Bridge().Delete(bridgeKey(active.BridgeID))
		active.BridgeID = ""
	}
	c.finalizeCall(ctx, active, state, cause)
}

func (c *Controller) startGatewaySession(ctx context.Context, req gatewaySessionRequest) (*gatewaySessionResponse, error) {
	if c.cfg.AiGatewayURL == "" {
		return nil, fmt.Errorf("AI gateway URL not configured")
	}
	body, _ := json.Marshal(req)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.AiGatewayURL+"/internal/v1/sessions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if c.cfg.InternalServiceToken != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.cfg.InternalServiceToken)
	}
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("gateway status %d: %s", resp.StatusCode, string(raw))
	}
	var out gatewaySessionResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Controller) fetchGatewayStats(ctx context.Context, sessionID string) (*gatewayMediaStats, error) {
	if c.cfg.AiGatewayURL == "" {
		return nil, fmt.Errorf("AI gateway URL not configured")
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, c.cfg.AiGatewayURL+"/internal/v1/sessions/"+sessionID+"/stats", nil)
	if err != nil {
		return nil, err
	}
	if c.cfg.InternalServiceToken != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.cfg.InternalServiceToken)
	}
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("gateway stats status %d", resp.StatusCode)
	}
	var out gatewayMediaStats
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Controller) resolveGatewayRTPHost(host string, port int) string {
	if ip := net.ParseIP(host); ip != nil {
		return fmt.Sprintf("%s:%d", ip.String(), port)
	}
	ips, err := net.LookupIP(host)
	if err == nil {
		for _, ip := range ips {
			if v4 := ip.To4(); v4 != nil {
				return fmt.Sprintf("%s:%d", v4.String(), port)
			}
		}
	}
	return fmt.Sprintf("%s:%d", host, port)
}

func (c *Controller) resolveUnicastRTPPeer(mediaChannelID string) string {
	for i := 0; i < 20; i++ {
		addr, err := c.client.Channel().GetVariable(channelKey(mediaChannelID), "UNICASTRTP_LOCAL_ADDRESS")
		if err != nil || addr == "" {
			time.Sleep(50 * time.Millisecond)
			continue
		}
		port, err := c.client.Channel().GetVariable(channelKey(mediaChannelID), "UNICASTRTP_LOCAL_PORT")
		if err != nil || port == "" {
			time.Sleep(50 * time.Millisecond)
			continue
		}
		return net.JoinHostPort(addr, port)
	}
	return ""
}

func (c *Controller) notifyGatewayPeer(ctx context.Context, sessionID, peer string) error {
	if c.cfg.AiGatewayURL == "" || peer == "" {
		return nil
	}
	body, _ := json.Marshal(map[string]string{"asteriskMediaAddress": peer})
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.AiGatewayURL+"/internal/v1/sessions/"+sessionID+"/peer", bytes.NewReader(body))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if c.cfg.InternalServiceToken != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.cfg.InternalServiceToken)
	}
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func (c *Controller) closeGatewaySession(ctx context.Context, sessionID string) error {
	if c.cfg.AiGatewayURL == "" {
		return nil
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodDelete, c.cfg.AiGatewayURL+"/internal/v1/sessions/"+sessionID, nil)
	if err != nil {
		return err
	}
	if c.cfg.InternalServiceToken != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.cfg.InternalServiceToken)
	}
	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

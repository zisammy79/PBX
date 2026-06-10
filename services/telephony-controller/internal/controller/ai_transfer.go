package controller

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/CyCoreSystems/ari/v6"
	"github.com/CyCoreSystems/ari/v6/rid"
	"github.com/google/uuid"
	"github.com/pbx-platform/telephony-controller/internal/aitools"
	"github.com/pbx-platform/telephony-controller/internal/calls"
)

func (c *Controller) executeTransferCall(ctx context.Context, active *calls.ActiveCall, req toolInvocationRequest, rawDest string) (map[string]any, int, error) {
	if active.TransferInProgress {
		return map[string]any{"invocationId": req.InvocationID, "status": "duplicate"}, http.StatusOK, nil
	}
	if _, err := aitools.ValidateTransferDestination(rawDest); err != nil {
		return nil, http.StatusBadRequest, err
	}
	if active.TransferExtensionNumber == "" {
		return nil, http.StatusBadRequest, fmt.Errorf("transfer destination not configured")
	}
	toExt, err := c.repo.LookupExtensionByTenantNumber(ctx, active.TenantSlug, active.TransferExtensionNumber)
	if err != nil {
		return nil, http.StatusBadRequest, fmt.Errorf("transfer extension unavailable")
	}
	if toExt.TenantID != active.TenantID {
		return nil, http.StatusForbidden, fmt.Errorf("cross-tenant transfer denied")
	}
	active.TransferInProgress = true
	active.TransferInvocationID = req.InvocationID
	active.TransferIdempotencyKey = req.IdempotencyKey
	c.registry.Put(active)

	stats, _ := c.fetchGatewayStats(ctx, active.AiSessionID.String())
	behaviorDiag := map[string]any{}
	if stats != nil && stats.Behavior != nil {
		behaviorDiag = stats.Behavior
	}

	now := time.Now().UTC()
	_ = c.repo.UpdateAiSessionState(ctx, active.AiSessionID, "TRANSFERRING", "transferring", map[string]any{
		"timing": map[string]any{"transferStartedAt": now.Format(time.RFC3339Nano)},
		"diagnostics": map[string]any{
			"transfer": map[string]any{
				"destinationAlias":  rawDest,
				"resolvedExtension": active.TransferExtensionNumber,
			},
			"behavior": behaviorDiag,
		},
	})

	c.detachAiMedia(ctx, active)

	endpoint := fmt.Sprintf("PJSIP/%s", toExt.AsteriskEndpointID)
	outKey := ari.NewKey(ari.ChannelKey, rid.New(rid.Channel))
	humanID := outKey.ID
	active.CalleeChannelID = humanID
	active.CalleeEndpointID = toExt.AsteriskEndpointID
	active.HadCalleeLeg = true
	c.registry.Put(active)
	_ = c.repo.InsertCallLeg(ctx, active.TenantID, active.CallID, "human", humanID, toExt.AsteriskEndpointID)

	callerHandle := c.client.Channel().Get(channelKey(active.CallerChannelID))
	var calleeHandle *ari.ChannelHandle
	if callerHandle != nil {
		calleeHandle, err = callerHandle.Originate(ari.OriginateRequest{
			Endpoint: endpoint,
			App:      c.cfg.StasisApp,
			AppArgs:  fmt.Sprintf("join,%s", active.CallID.String()),
			CallerID: fmt.Sprintf("\"AI Transfer\" <%s>", active.CallerNumber),
			Timeout:  30,
		})
	} else {
		calleeHandle, err = c.client.Channel().Originate(outKey, ari.OriginateRequest{
			Endpoint: endpoint,
			App:      c.cfg.StasisApp,
			AppArgs:  fmt.Sprintf("join,%s", active.CallID.String()),
			CallerID: fmt.Sprintf("\"AI Transfer\" <%s>", active.CallerNumber),
			Timeout:  30,
		})
	}
	if err != nil {
		slog.Error("transfer originate failed", "error", err)
		active.CalleeChannelID = ""
		active.HadCalleeLeg = false
		c.registry.Put(active)
		_ = c.repo.UpdateAiSessionState(ctx, active.AiSessionID, "FAILED", "failed", map[string]any{
			"diagnostics": map[string]any{"failureCategory": "transfer_originate_failed"},
		})
		c.finalizeCall(ctx, active, calls.StateFailed, "transfer_originate_failed")
		return nil, http.StatusInternalServerError, err
	}
	if calleeHandle != nil && calleeHandle.ID() != "" && calleeHandle.ID() != humanID {
		active.CalleeChannelID = calleeHandle.ID()
		c.registry.Put(active)
	}
	go c.waitTransferAnswer(context.Background(), active.CallID, active.AiSessionID, req.InvocationID, active.TransferExtensionNumber)
	return map[string]any{
		"invocationId": req.InvocationID,
		"status":       "accepted",
		"destination":  active.TransferExtensionNumber,
	}, http.StatusOK, nil
}

func (c *Controller) detachAiMedia(ctx context.Context, active *calls.ActiveCall) {
	mediaID := active.AiMediaChannelID
	if mediaID == "" {
		mediaID = active.CalleeChannelID
	}
	if active.BridgeID != "" && mediaID != "" {
		_ = c.client.Bridge().RemoveChannel(bridgeKey(active.BridgeID), mediaID)
	}
	if mediaID != "" {
		c.hangup(mediaID)
		if active.CalleeChannelID == mediaID {
			active.CalleeChannelID = ""
		}
		active.AiMediaChannelID = ""
	}
	c.registry.Put(active)
}

func (c *Controller) completeAiTransfer(ctx context.Context, active *calls.ActiveCall, humanChannelID string) {
	if active == nil || active.AiSessionID == uuid.Nil || !active.TransferInProgress {
		return
	}
	if !active.MarkEvent("ai-transfer-complete") {
		return
	}
	sessionID := active.AiSessionID
	stats, _ := c.fetchGatewayStats(context.Background(), sessionID.String())
	c.recordAiUsage(context.Background(), active, stats, active.TransferIdempotencyKey)
	_ = c.closeGatewaySession(context.Background(), sessionID.String())

	now := time.Now().UTC()
	_ = c.repo.UpdateAiSessionState(ctx, sessionID, "TRANSFERRED", "transferred", map[string]any{
		"timing": map[string]any{
			"transferredAt": now.Format(time.RFC3339Nano),
			"completedAt":   now.Format(time.RFC3339Nano),
		},
		"diagnostics": map[string]any{
			"toolResult": map[string]any{
				"invocationId": active.TransferInvocationID,
				"status":       "completed",
				"toolName":     "transfer_call",
			},
			"transfer": map[string]any{
				"humanChannelId": humanChannelID,
			},
		},
		"ended_at": now,
	})
	active.IsAiCall = false
	active.Transition(calls.StateBridged)
	_ = c.repo.InsertCallEvent(ctx, active.TenantID, active.CallID, "TRANSFERRED", map[string]any{
		"humanExtension": active.TransferExtensionNumber,
		"humanChannelId": humanChannelID,
	})
	c.registry.Put(active)
}

func (c *Controller) waitTransferAnswer(ctx context.Context, callID, sessionID uuid.UUID, invocationID, humanExt string) {
	deadline := time.Now().Add(35 * time.Second)
	for time.Now().Before(deadline) {
		active, ok := c.registry.Get(callID)
		if !ok {
			return
		}
		if !active.TransferInProgress || active.AiSessionID != sessionID {
			return
		}
		if humanID, up := c.detectTransferHumanLeg(active); up {
			active.CalleeChannelID = humanID
			active.HadCalleeLeg = true
			c.registry.Put(active)
			_ = c.repo.InsertCallLeg(ctx, active.TenantID, active.CallID, "human", humanID, active.CalleeEndpointID)
			if active.BridgeID != "" {
				if active.CallerChannelID != "" {
					_ = c.client.Bridge().AddChannel(bridgeKey(active.BridgeID), active.CallerChannelID)
				}
				_ = c.client.Bridge().AddChannel(bridgeKey(active.BridgeID), humanID)
			}
			c.completeAiTransfer(ctx, active, humanID)
			c.markAnsweredAndBridged(ctx, active)
			return
		}
		time.Sleep(200 * time.Millisecond)
	}
	active, ok := c.registry.Get(callID)
	if !ok || !active.TransferInProgress || active.AiSessionID != sessionID {
		return
	}
	if humanID := active.CalleeChannelID; humanID != "" {
		c.hangup(humanID)
	}
	active.CalleeChannelID = ""
	active.HadCalleeLeg = false
	active.TransferInProgress = false
	c.registry.Put(active)
	_ = c.repo.UpdateAiSessionState(ctx, sessionID, "FAILED", "failed", map[string]any{
		"diagnostics": map[string]any{
			"failureCategory": "transfer_no_answer",
			"toolResult": map[string]any{
				"invocationId": invocationID,
				"status":       "failed",
				"toolName":     "transfer_call",
			},
		},
	})
	_ = c.closeGatewaySession(ctx, sessionID.String())
}

func (c *Controller) detectTransferHumanLeg(active *calls.ActiveCall) (string, bool) {
	if active == nil {
		return "", false
	}
	candidates := []string{}
	if active.CalleeChannelID != "" {
		candidates = append(candidates, active.CalleeChannelID)
	}
	if active.BridgeID != "" {
		if data, err := c.client.Bridge().Data(bridgeKey(active.BridgeID)); err == nil {
			for _, key := range data.Channels() {
				if key != nil && key.ID != "" && key.ID != active.CallerChannelID {
					candidates = append(candidates, key.ID)
				}
			}
		}
	}
	if active.TransferExtensionNumber != "" && active.TenantSlug != "" {
		needle := fmt.Sprintf("ext_%s", active.TransferExtensionNumber)
		if keys, err := c.client.Channel().List(nil); err == nil {
			for _, key := range keys {
				if key == nil || key.ID == "" || key.ID == active.CallerChannelID {
					continue
				}
				data, err := c.client.Channel().Data(key)
				if err != nil || !strings.EqualFold(data.State, "Up") {
					continue
				}
				if strings.Contains(data.Name, needle) {
					return key.ID, true
				}
			}
		}
	}
	seen := map[string]bool{}
	for _, id := range candidates {
		if id == "" || id == active.CallerChannelID || seen[id] {
			continue
		}
		seen[id] = true
		data, err := c.client.Channel().Data(channelKey(id))
		if err == nil && strings.EqualFold(data.State, "Up") {
			return id, true
		}
	}
	return "", false
}

func (c *Controller) recordAiUsage(ctx context.Context, active *calls.ActiveCall, stats *gatewayMediaStats, idempotencyKey string) {
	if active == nil || active.AiSessionID == uuid.Nil {
		return
	}
	sessionID := active.AiSessionID
	seconds := time.Since(active.CreatedAt).Seconds()
	c.writeAiUsageMeter(ctx, active, sessionID, "ai_realtime_session_seconds", "seconds", seconds, sessionID.String()+":session_seconds", "")
	toolKey := sessionID.String() + ":tool_calls"
	if idempotencyKey != "" {
		toolKey = idempotencyKey + ":usage"
	}
	c.writeAiUsageMeter(ctx, active, sessionID, "ai_tool_calls", "count", 1, toolKey, "")
	if stats != nil && stats.RTPPacketsReceived > 0 {
		inSec := float64(stats.RTPPacketsReceived) * 0.02
		c.writeAiUsageMeter(ctx, active, sessionID, "ai_input_audio_seconds", "seconds", inSec, sessionID.String()+":input_audio", "")
	}
	if stats != nil && stats.RTPPacketsSent > 0 {
		outSec := float64(stats.RTPPacketsSent) * 0.02
		c.writeAiUsageMeter(ctx, active, sessionID, "ai_output_audio_seconds", "seconds", outSec, sessionID.String()+":output_audio", "")
	}
}

func (c *Controller) writeAiUsageMeter(ctx context.Context, active *calls.ActiveCall, sessionID uuid.UUID, meter, unit string, qty float64, idempotencyKey, providerEventID string) {
	inserted, err := c.repo.WriteAiUsage(ctx, active.TenantID, sessionID, active.CallID, active.CorrelationID,
		meter, unit, "PLATFORM_MEASURED", qty, idempotencyKey, providerEventID)
	if err != nil {
		slog.Warn("ai usage write failed", "meter", meter, "session", sessionID, "error", err)
		return
	}
	if !inserted {
		slog.Debug("ai usage duplicate skipped", "meter", meter, "session", sessionID, "idempotencyKey", idempotencyKey)
	}
}

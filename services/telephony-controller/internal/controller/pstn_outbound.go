package controller

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/CyCoreSystems/ari/v6"
	"github.com/google/uuid"
	"github.com/pbx-platform/telephony-controller/internal/calls"
	"github.com/pbx-platform/telephony-controller/internal/repository"
)

// isPstnOutboundStasis reports Stasis args for extension-originated PSTN outbound.
// Shape: tenant slug, caller ref (extension number or SIP user), "outbound", E.164 destination.
func isPstnOutboundStasis(args []string) bool {
	if len(args) < 4 {
		return false
	}
	if strings.TrimSpace(args[2]) != "outbound" {
		return false
	}
	dest := strings.TrimSpace(args[3])
	return strings.HasPrefix(dest, "+") && len(dest) >= 8
}

func buildPjsipTrunkDialTarget(e164, trunkAsteriskID string) string {
	return fmt.Sprintf("PJSIP/%s@%s", e164, trunkAsteriskID)
}

func (c *Controller) onPstnOutboundStart(ctx context.Context, channelID, tenantSlug, callerRef, destE164 string) {
	destE164 = strings.TrimSpace(destE164)
	callerRef = strings.TrimSpace(callerRef)
	if !strings.HasPrefix(destE164, "+") {
		slog.Warn("outbound invalid destination", "tenant", tenantSlug, "dest", destE164)
		c.hangup(channelID)
		return
	}

	callable, err := c.repo.IsTenantCallable(ctx, tenantSlug)
	if err != nil || !callable {
		slog.Warn("tenant not callable for outbound", "tenant", tenantSlug, "error", err)
		c.hangup(channelID)
		return
	}

	fromExt, err := c.repo.LookupExtensionByCallerRef(ctx, tenantSlug, callerRef)
	if err != nil {
		slog.Error("outbound caller extension lookup failed", "tenant", tenantSlug, "caller", callerRef, "error", err)
		c.hangup(channelID)
		return
	}

	route, err := c.repo.LookupDefaultOutboundRoute(ctx, fromExt.TenantID)
	if err != nil {
		slog.Error("outbound route lookup failed", "tenant", tenantSlug, "error", err)
		c.hangup(channelID)
		return
	}

	callID := uuid.New()
	correlationID := uuid.New()
	now := time.Now().UTC()
	fromExtID := fromExt.ID

	active := &calls.ActiveCall{
		CallID:          callID,
		TenantID:        fromExt.TenantID,
		CorrelationID:   correlationID,
		TenantSlug:      tenantSlug,
		CallerNumber:    fromExt.ExtensionNumber,
		CalleeNumber:    destE164,
		State:           calls.StateCreated,
		CallerChannelID: channelID,
		FromExtensionID: fromExt.ID,
		CreatedAt:       now,
		ProcessedEvents: map[string]bool{},
	}
	active.Transition(calls.StateRinging)
	c.registry.Put(active)

	rec := repository.CallRecord{
		ID:                callID,
		TenantID:          fromExt.TenantID,
		CorrelationID:     correlationID,
		Direction:         "outbound",
		Status:            "ringing",
		FromExtensionID:   &fromExtID,
		ToExtensionID:     nil,
		CallerNumber:      fromExt.ExtensionNumber,
		CalleeNumber:      destE164,
		AsteriskChannelID: channelID,
		StartedAt:         now,
	}

	if err := c.repo.CreateCall(ctx, rec); err != nil {
		if strings.Contains(err.Error(), "concurrent_call_limit_reached") {
			slog.Warn("concurrent call limit reached", "tenant", tenantSlug)
			c.finalizeCall(ctx, active, calls.StateFailed, "concurrent_call_limit_reached")
		} else {
			slog.Error("outbound create call failed", "error", err, "tenant", tenantSlug)
			c.finalizeCall(ctx, active, calls.StateFailed, "call_create_failed")
		}
		c.hangup(channelID)
		return
	}

	_ = c.repo.InsertCallLeg(ctx, fromExt.TenantID, callID, "caller", channelID, fromExt.AsteriskEndpointID)
	_ = c.repo.InsertCallEvent(ctx, fromExt.TenantID, callID, "CREATED", map[string]any{"source": "asterisk", "direction": "outbound"})
	_ = c.repo.InsertCallEvent(ctx, fromExt.TenantID, callID, "RINGING", map[string]any{"source": "asterisk"})
	_ = c.bus.PublishCallEvent(ctx, fromExt.TenantID, callID, correlationID, "RINGING", map[string]any{
		"caller": fromExt.ExtensionNumber, "callee": destE164, "direction": "outbound",
	})

	slog.Info(
		"pstn outbound stasis start",
		"tenant_slug", tenantSlug,
		"from_extension", fromExt.ExtensionNumber,
		"destination", destE164,
		"trunk", route.TrunkAsteriskID,
		"caller_id", route.CallerID,
	)

	if callerData, dataErr := c.client.Channel().Data(channelKey(channelID)); dataErr == nil {
		if !strings.EqualFold(callerData.State, "Up") {
			if answerErr := c.client.Channel().Answer(channelKey(channelID)); answerErr != nil {
				slog.Error("outbound answer caller failed", "error", answerErr, "callId", callID.String())
				c.finalizeCall(ctx, active, calls.StateFailed, "answer_failed")
				c.hangup(channelID)
				return
			}
		}
	}

	trunkTarget := buildPjsipTrunkDialTarget(destE164, route.TrunkAsteriskID)
	callerID := fmt.Sprintf("\"PBX Outbound\" <%s>", route.CallerID)
	calleeHandle, origErr := c.client.Channel().Originate(channelKey(channelID), ari.OriginateRequest{
		Endpoint:   trunkTarget,
		App:        c.cfg.StasisApp,
		AppArgs:    fmt.Sprintf("join,%s", callID.String()),
		CallerID:   callerID,
		Timeout:    60,
		Originator: channelID,
	})
	if origErr != nil {
		slog.Error("outbound trunk originate failed", "error", origErr, "endpoint", trunkTarget, "callId", callID.String())
		c.finalizeCall(ctx, active, calls.StateFailed, "originate_failed")
		c.hangup(channelID)
		return
	}

	active.HadCalleeLeg = true
	if calleeHandle != nil {
		calleeID := calleeHandle.ID()
		if calleeID != "" {
			active.PendingCalleeChannelIDs = []string{calleeID}
			active.CalleeChannelID = calleeID
			active.CalleeEndpointID = route.TrunkAsteriskID
			_ = c.repo.InsertCallLeg(ctx, fromExt.TenantID, callID, "callee", calleeID, route.TrunkAsteriskID)
			go c.waitCalleeAnswered(context.Background(), active.CallID, *calleeHandle)
		}
	}
	c.registry.Put(active)
}

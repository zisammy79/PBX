package controller

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/CyCoreSystems/ari/v6"
	"github.com/CyCoreSystems/ari/v6/client/native"
	"github.com/CyCoreSystems/ari/v6/rid"
	"github.com/google/uuid"
	"github.com/pbx-platform/telephony-controller/internal/calls"
	"github.com/pbx-platform/telephony-controller/internal/natsbus"
	"github.com/pbx-platform/telephony-controller/internal/repository"
)

type Controller struct {
	cfg      Config
	repo     *repository.Repository
	registry *calls.Registry
	bus      *natsbus.Publisher
	client   ari.Client
	cancel   context.CancelFunc
}

type Config struct {
	AriURL               string
	AriWsURL             string
	AriUsername          string
	AriPassword          string
	StasisApp            string
	AiGatewayURL         string
	InternalServiceToken string
	ReconnectMin         time.Duration
	ReconnectMax         time.Duration
}

func New(cfg Config, repo *repository.Repository, registry *calls.Registry, bus *natsbus.Publisher) *Controller {
	return &Controller{cfg: cfg, repo: repo, registry: registry, bus: bus}
}

func (c *Controller) Run(ctx context.Context) error {
	ctx, c.cancel = context.WithCancel(ctx)
	backoff := c.cfg.ReconnectMin
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		client, err := native.Connect(&native.Options{
			Application:  c.cfg.StasisApp,
			Username:     c.cfg.AriUsername,
			Password:     c.cfg.AriPassword,
			URL:          c.cfg.AriURL,
			WebsocketURL: c.cfg.AriWsURL,
		})
		if err != nil {
			slog.Error("ari connect failed", "error", err)
			time.Sleep(backoff)
			if backoff < c.cfg.ReconnectMax {
				backoff *= 2
			}
			continue
		}
		backoff = c.cfg.ReconnectMin
		c.client = client
		slog.Info("connected to asterisk ari")

		sub := client.Bus().Subscribe(nil, "StasisStart", "StasisEnd", "ChannelDestroyed", "ChannelStateChange", "ChannelEnteredBridge")
		events := sub.Events()
		for {
			select {
			case <-ctx.Done():
				sub.Cancel()
				client.Close()
				return ctx.Err()
			case e, ok := <-events:
				if !ok {
					slog.Warn("ari subscription closed, reconnecting")
					sub.Cancel()
					client.Close()
					goto reconnect
				}
				c.handleEvent(ctx, e)
			}
		}
	reconnect:
	}
}

func (c *Controller) Close() {
	if c.cancel != nil {
		c.cancel()
	}
	if c.client != nil {
		c.client.Close()
	}
}

func (c *Controller) handleEvent(ctx context.Context, e ari.Event) {
	switch ev := e.(type) {
	case *ari.StasisStart:
		c.onStasisStart(ctx, ev)
	case *ari.StasisEnd:
		c.onStasisEnd(ctx, ev)
	case *ari.ChannelDestroyed:
		c.onChannelDestroyed(ctx, ev)
	case *ari.ChannelStateChange:
		c.onChannelStateChange(ctx, ev)
	case *ari.ChannelEnteredBridge:
		c.onChannelEnteredBridge(ctx, ev)
	}
}

func channelKey(id string) *ari.Key {
	return ari.NewKey(ari.ChannelKey, id)
}

func bridgeKey(id string) *ari.Key {
	return ari.NewKey(ari.BridgeKey, id)
}

func (c *Controller) onStasisStart(ctx context.Context, ev *ari.StasisStart) {
	channelID := ev.Channel.ID
	if channelID == "" {
		return
	}
	args := ev.Args
	if len(args) >= 4 && args[2] == "ai" {
		c.onAiStasisStart(ctx, channelID, args[0], args[1], args[3])
		return
	}
	if callIDStr, ok := parseJoinArgs(args); ok {
		c.handleJoinLeg(ctx, channelID, callIDStr)
		return
	}
	if len(args) < 3 {
		slog.Warn("stasis start missing args", "channel", channelID, "args", args)
		return
	}
	tenantSlug := args[0]
	callerNum := args[1]
	destNum := args[2]

	fromExt, err := c.repo.LookupExtensionByTenantNumber(ctx, tenantSlug, callerNum)
	if err != nil {
		slog.Error("caller extension lookup failed", "tenant", tenantSlug, "ext", callerNum)
		c.hangup(channelID)
		return
	}
	toExt, err := c.repo.LookupExtensionByTenantNumber(ctx, tenantSlug, destNum)
	if err != nil {
		slog.Error("callee extension lookup failed", "tenant", tenantSlug, "ext", destNum)
		c.hangup(channelID)
		return
	}

	callID := uuid.New()
	correlationID := uuid.New()
	now := time.Now().UTC()
	active := &calls.ActiveCall{
		CallID:           callID,
		TenantID:         fromExt.TenantID,
		CorrelationID:    correlationID,
		TenantSlug:       tenantSlug,
		CallerNumber:     callerNum,
		CalleeNumber:     destNum,
		State:            calls.StateCreated,
		CallerChannelID:  channelID,
		CalleeEndpointID: toExt.AsteriskEndpointID,
		FromExtensionID:  fromExt.ID,
		ToExtensionID:    toExt.ID,
		CreatedAt:        now,
		ProcessedEvents:  map[string]bool{},
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
		ToExtensionID:     &toExt.ID,
		CallerNumber:      callerNum,
		CalleeNumber:      destNum,
		AsteriskChannelID: channelID,
		StartedAt:         now,
	}
	_ = c.repo.CreateCall(ctx, rec)
	_ = c.repo.InsertCallLeg(ctx, fromExt.TenantID, callID, "caller", channelID, fromExt.AsteriskEndpointID)
	_ = c.repo.InsertCallEvent(ctx, fromExt.TenantID, callID, "CREATED", map[string]any{"source": "asterisk"})
	_ = c.repo.InsertCallEvent(ctx, fromExt.TenantID, callID, "RINGING", map[string]any{"source": "asterisk"})
	_ = c.bus.PublishCallEvent(ctx, fromExt.TenantID, callID, correlationID, "RINGING", map[string]any{
		"caller": callerNum, "callee": destNum,
	})

	endpoint := fmt.Sprintf("PJSIP/%s", toExt.AsteriskEndpointID)
	bKey := ari.NewKey(ari.BridgeKey, rid.New(rid.Bridge))
	bridge, err := c.client.Bridge().Create(bKey, "mixing", bKey.ID)
	if err != nil {
		slog.Error("bridge create failed", "error", err)
		c.finalizeCall(ctx, active, calls.StateFailed, "bridge_create_failed")
		return
	}
	active.BridgeID = bridge.ID()
	_ = c.repo.UpdateCallStatus(ctx, callID, "ringing", map[string]any{"asterisk_bridge_id": bridge.ID()})

	if err := c.client.Channel().Answer(channelKey(channelID)); err != nil {
		slog.Error("answer caller failed", "error", err)
		c.finalizeCall(ctx, active, calls.StateFailed, "answer_failed")
		return
	}
	_ = c.client.Bridge().AddChannel(bridgeKey(active.BridgeID), channelID)

	callerHandle := c.client.Channel().Get(channelKey(channelID))
	calleeHandle, err := callerHandle.Originate(ari.OriginateRequest{
		Endpoint: endpoint,
		App:      c.cfg.StasisApp,
		AppArgs:  fmt.Sprintf("join,%s", callID.String()),
		CallerID: fmt.Sprintf("\"%s\" <%s>", callerNum, callerNum),
		Timeout:  30,
	})
	if err != nil {
		slog.Error("originate failed", "error", err)
		c.finalizeCall(ctx, active, calls.StateFailed, "originate_failed")
		return
	}
	if calleeHandle != nil {
		calleeID := calleeHandle.ID()
		if calleeID != "" {
			active.CalleeChannelID = calleeID
			active.HadCalleeLeg = true
			c.registry.Put(active)
			_ = c.repo.InsertCallLeg(ctx, fromExt.TenantID, callID, "callee", calleeID, toExt.AsteriskEndpointID)
			go c.waitCalleeAnswered(context.Background(), active.CallID, *calleeHandle)
			go c.waitBridgeReady(context.Background(), active.CallID)
		}
	}
}

func (c *Controller) waitBridgeReady(ctx context.Context, callID uuid.UUID) {
	deadline := time.Now().Add(35 * time.Second)
	for time.Now().Before(deadline) {
		active, ok := c.registry.Get(callID)
		if !ok || active.State == calls.StateComplete || active.State == calls.StateFailed {
			return
		}
		if active.BridgeID == "" {
			select {
			case <-ctx.Done():
				return
			case <-time.After(200 * time.Millisecond):
				continue
			}
		}
		data, err := c.client.Bridge().Data(bridgeKey(active.BridgeID))
		if err == nil {
			channelKeys := data.Channels()
			if len(channelKeys) >= 2 {
				for _, key := range channelKeys {
					if key == nil || key.ID == active.CallerChannelID {
						continue
					}
					if active.CalleeChannelID == "" || strings.HasSuffix(active.CalleeChannelID, "-ch") {
						active.CalleeChannelID = key.ID
						c.registry.Put(active)
						_ = c.repo.UpdateCallLegChannel(ctx, active.TenantID, active.CallID, "callee", key.ID)
					}
				}
				c.markAnsweredAndBridged(ctx, active)
				return
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(200 * time.Millisecond):
		}
	}
}

func (c *Controller) waitCalleeAnswered(ctx context.Context, callID uuid.UUID, handle ari.ChannelHandle) {
	deadline := time.Now().Add(35 * time.Second)
	for time.Now().Before(deadline) {
		active, ok := c.registry.Get(callID)
		if !ok || active.State == calls.StateComplete || active.State == calls.StateFailed {
			return
		}
		data, err := handle.Data()
		if err == nil {
			if data.ID != "" && data.ID != active.CalleeChannelID {
				active.CalleeChannelID = data.ID
				c.registry.Put(active)
			}
			if strings.EqualFold(data.State, "Up") {
				c.markAnsweredAndBridged(ctx, active)
				return
			}
		}
		if active.CalleeEndpointID != "" {
			keys, listErr := c.client.Channel().List(nil)
			if listErr == nil {
				for _, key := range keys {
					if key == nil {
						continue
					}
					chData, dataErr := c.client.Channel().Data(key)
					if dataErr != nil {
						continue
					}
					if strings.Contains(chData.Name, active.CalleeEndpointID) && strings.EqualFold(chData.State, "Up") {
						active.CalleeChannelID = chData.ID
						c.registry.Put(active)
						_ = c.repo.UpdateCallLegChannel(ctx, active.TenantID, active.CallID, "callee", chData.ID)
						c.markAnsweredAndBridged(ctx, active)
						return
					}
				}
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(200 * time.Millisecond):
		}
	}
}

func (c *Controller) handleJoinLeg(ctx context.Context, channelID, callIDStr string) {
	callID, err := uuid.Parse(callIDStr)
	if err != nil {
		return
	}
	active, ok := c.registry.Get(callID)
	if !ok {
		return
	}
	if active.CalleeChannelID == "" {
		active.CalleeChannelID = channelID
		active.HadCalleeLeg = true
		c.registry.Put(active)
		legType := "callee"
		if active.TransferInProgress {
			legType = "human"
		}
		_ = c.repo.InsertCallLeg(ctx, active.TenantID, callID, legType, channelID, active.CalleeEndpointID)
	} else if active.CalleeChannelID != channelID {
		slog.Warn("join leg channel mismatch", "expected", active.CalleeChannelID, "got", channelID)
	}
	if active.TransferInProgress && active.AiSessionID != uuid.Nil {
		c.completeAiTransfer(ctx, active, channelID)
	}
	c.markAnsweredAndBridged(ctx, active)
}

func (c *Controller) markAnsweredAndBridged(ctx context.Context, active *calls.ActiveCall) {
	if active.BridgeID != "" && active.CallerChannelID != "" && active.CalleeChannelID != "" {
		if active.MarkEvent("bridge:channels-added") {
			members := map[string]bool{}
			if data, err := c.client.Bridge().Data(bridgeKey(active.BridgeID)); err == nil {
				for _, key := range data.Channels() {
					if key != nil {
						members[key.ID] = true
					}
				}
			}
			if !members[active.CallerChannelID] {
				_ = c.client.Bridge().AddChannel(bridgeKey(active.BridgeID), active.CallerChannelID)
			}
			if !members[active.CalleeChannelID] {
				_ = c.client.Bridge().AddChannel(bridgeKey(active.BridgeID), active.CalleeChannelID)
			}
		}
	}
	now := time.Now().UTC()
	if active.MarkEvent("persist:answered") {
		active.Transition(calls.StateAnswered)
		_ = c.repo.UpdateCallStatus(ctx, active.CallID, "answered", map[string]any{"answered_at": now})
		_ = c.repo.InsertCallEvent(ctx, active.TenantID, active.CallID, "ANSWERED", map[string]any{"source": "asterisk"})
		if active.CalleeChannelID != "" {
			_ = c.repo.UpdateCallLegAnswered(ctx, active.TenantID, active.CallID, active.CalleeChannelID, now)
		}
	}
	if active.MarkEvent("persist:bridged") {
		active.Transition(calls.StateBridged)
		_ = c.repo.InsertCallEvent(ctx, active.TenantID, active.CallID, "BRIDGED", map[string]any{"bridgeId": active.BridgeID, "source": "platform"})
		_ = c.bus.PublishCallEvent(ctx, active.TenantID, active.CallID, active.CorrelationID, "BRIDGED", map[string]any{
			"bridgeId": active.BridgeID,
		})
	}
	c.registry.Put(active)
}

func (c *Controller) ensureAnsweredAndBridged(ctx context.Context, active *calls.ActiveCall) {
	if active.CalleeChannelID == "" {
		return
	}
	c.markAnsweredAndBridged(ctx, active)
}

func (c *Controller) onStasisEnd(ctx context.Context, ev *ari.StasisEnd) {
	if ev.Channel.ID == "" {
		return
	}
	active, ok := c.registry.ByChannel(ev.Channel.ID)
	if !ok || active == nil {
		return
	}
	eventID := fmt.Sprintf("stasis-end:%s", ev.Channel.ID)
	if !active.MarkEvent(eventID) {
		return
	}
	peer := ""
	if ev.Channel.ID == active.CallerChannelID {
		peer = active.CalleeChannelID
		active.CallerChannelID = ""
	} else if ev.Channel.ID == active.CalleeChannelID {
		peer = active.CallerChannelID
		active.CalleeChannelID = ""
	}
	c.registry.Put(active)
	if peer != "" {
		c.hangup(peer)
	}
	if active.CallerChannelID == "" && active.CalleeChannelID == "" {
		if active.IsAiCall {
			c.finalizeAiCall(ctx, active, calls.StateComplete, "normal", nil)
			return
		}
		c.finalizeCall(ctx, active, calls.StateComplete, "normal")
	}
}

func (c *Controller) onChannelEnteredBridge(ctx context.Context, ev *ari.ChannelEnteredBridge) {
	if ev.Channel.ID == "" || ev.Bridge.ID == "" {
		return
	}
	active, ok := c.registry.ByChannel(ev.Channel.ID)
	if !ok || active == nil {
		active, ok = c.registry.ByBridge(ev.Bridge.ID)
	}
	if !ok || active == nil {
		return
	}
	if ev.Channel.ID == active.CallerChannelID {
		return
	}
	if active.CalleeChannelID == "" || strings.HasSuffix(active.CalleeChannelID, "-ch") {
		active.CalleeChannelID = ev.Channel.ID
		c.registry.Put(active)
		_ = c.repo.UpdateCallLegChannel(ctx, active.TenantID, active.CallID, "callee", ev.Channel.ID)
	}
	c.markAnsweredAndBridged(ctx, active)
}

func (c *Controller) onChannelStateChange(ctx context.Context, ev *ari.ChannelStateChange) {
	if ev.Channel.ID == "" || !strings.EqualFold(ev.Channel.State, "Up") {
		return
	}
	active, ok := c.registry.ByChannel(ev.Channel.ID)
	if !ok || active == nil {
		return
	}
	if active.TransferInProgress && active.AiSessionID != uuid.Nil && ev.Channel.ID == active.CalleeChannelID {
		c.completeAiTransfer(ctx, active, ev.Channel.ID)
	}
	if ev.Channel.ID == active.CalleeChannelID {
		c.markAnsweredAndBridged(ctx, active)
	}
}

func (c *Controller) onChannelDestroyed(ctx context.Context, ev *ari.ChannelDestroyed) {
	if ev.Channel.ID == "" {
		return
	}
	active, ok := c.registry.ByChannel(ev.Channel.ID)
	if !ok || active == nil {
		return
	}
	eventID := fmt.Sprintf("destroy:%s", ev.Channel.ID)
	if !active.MarkEvent(eventID) {
		return
	}
	if active.HadCalleeLeg {
		c.ensureAnsweredAndBridged(ctx, active)
	}
	if ev.Channel.ID == active.CallerChannelID {
		active.CallerChannelID = ""
	} else if ev.Channel.ID == active.CalleeChannelID {
		active.CalleeChannelID = ""
	}
	c.registry.Put(active)
	if active.CallerChannelID != "" || active.CalleeChannelID != "" {
		return
	}
	if active.IsAiCall {
		c.finalizeAiCall(ctx, active, calls.StateComplete, ev.CauseTxt, nil)
		return
	}
	c.finalizeCall(ctx, active, calls.StateComplete, ev.CauseTxt)
}

func (c *Controller) finalizeCall(ctx context.Context, active *calls.ActiveCall, state, cause string) {
	if !active.MarkEvent("finalized") {
		return
	}
	if state == calls.StateComplete && (active.CalleeChannelID != "" || active.HadCalleeLeg) {
		c.ensureAnsweredAndBridged(ctx, active)
	}
	if active.State == calls.StateComplete || active.State == calls.StateFailed {
		return
	}
	active.HangupCause = cause
	active.Transition(state)
	end := time.Now().UTC()
	dur := int(end.Sub(active.CreatedAt).Seconds())
	if dur < 0 {
		dur = 0
	}
	status := "completed"
	if state == calls.StateFailed {
		status = "failed"
	}
	_ = c.repo.UpdateCallStatus(ctx, active.CallID, status, map[string]any{
		"ended_at":         end,
		"duration_seconds": dur,
		"billable_seconds": dur,
		"hangup_cause":     cause,
	})
	_ = c.repo.EndCallLegs(ctx, active.TenantID, active.CallID, end)
	_ = c.repo.InsertCallEvent(ctx, active.TenantID, active.CallID, state, map[string]any{
		"hangupCause": cause, "source": "platform",
	})
	_ = c.bus.PublishCallEvent(ctx, active.TenantID, active.CallID, active.CorrelationID, state, map[string]any{
		"durationSeconds": dur,
	})
	if state == calls.StateComplete {
		_, _ = c.repo.WriteUsageEvent(ctx, active.TenantID, active.CallID, active.CorrelationID, dur, active.CreatedAt, end)
	}
	c.registry.Remove(active.CallID)
}

func (c *Controller) hangup(channelID string) {
	_ = c.client.Channel().Hangup(channelKey(channelID), "normal")
}

func (c *Controller) Registry() *calls.Registry {
	return c.registry
}

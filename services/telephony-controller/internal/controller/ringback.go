package controller

import (
	"log/slog"
	"strings"

	"github.com/CyCoreSystems/ari/v6"
	"github.com/CyCoreSystems/ari/v6/rid"
	"github.com/pbx-platform/telephony-controller/internal/calls"
)

func ringbackToneURI() string {
	return "tone:ring"
}

func (c *Controller) startCallerRingback(active *calls.ActiveCall) {
	if c == nil || c.client == nil || active == nil || active.CallerChannelID == "" {
		return
	}
	callerKey := channelKey(active.CallerChannelID)
	data, err := c.client.Channel().Data(callerKey)
	if err != nil {
		slog.Warn("caller ringback channel data failed", "error", err, "channel", active.CallerChannelID)
		return
	}
	state := strings.ToLower(strings.TrimSpace(data.State))
	if state == "up" {
		if active.RingbackPlaybackID != "" {
			return
		}
		playbackID := rid.New(rid.Playback)
		playback, playErr := c.client.Channel().Play(callerKey, playbackID, ringbackToneURI())
		if playErr != nil {
			slog.Warn("caller ringback play failed", "error", playErr, "channel", active.CallerChannelID)
			return
		}
		if playback != nil {
			active.RingbackPlaybackID = playback.ID()
			c.registry.Put(active)
		}
		return
	}
	if err := c.client.Channel().Ring(callerKey); err != nil {
		slog.Warn("caller ring indication failed", "error", err, "channel", active.CallerChannelID)
		if active.RingbackPlaybackID != "" {
			return
		}
		playbackID := rid.New(rid.Playback)
		playback, playErr := c.client.Channel().Play(callerKey, playbackID, ringbackToneURI())
		if playErr != nil {
			slog.Warn("caller ringback play fallback failed", "error", playErr, "channel", active.CallerChannelID)
			return
		}
		if playback != nil {
			active.RingbackPlaybackID = playback.ID()
			c.registry.Put(active)
		}
	}
}

func (c *Controller) stopCallerRingback(active *calls.ActiveCall) {
	if c == nil || c.client == nil || active == nil || active.CallerChannelID == "" {
		return
	}
	callerKey := channelKey(active.CallerChannelID)
	if active.RingbackPlaybackID != "" {
		if err := c.client.Playback().Stop(playbackKey(active.RingbackPlaybackID)); err != nil {
			slog.Debug("stop caller ringback playback", "error", err, "playback", active.RingbackPlaybackID)
		}
		active.RingbackPlaybackID = ""
		c.registry.Put(active)
	}
	if err := c.client.Channel().StopRing(callerKey); err != nil {
		slog.Debug("stop caller ring indication", "error", err, "channel", active.CallerChannelID)
	}
}

func playbackKey(id string) *ari.Key {
	return ari.NewKey(ari.PlaybackKey, id)
}

func isCalleeLeg(active *calls.ActiveCall, channelID string) bool {
	if active == nil || channelID == "" {
		return false
	}
	if channelID == active.CalleeChannelID {
		return true
	}
	return containsString(active.PendingCalleeChannelIDs, channelID)
}

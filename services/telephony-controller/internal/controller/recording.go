package controller

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/CyCoreSystems/ari/v6"
	"github.com/google/uuid"
	"github.com/pbx-platform/telephony-controller/internal/calls"
	"github.com/pbx-platform/telephony-controller/internal/recording"
)

func (c *Controller) maybeStartRecording(ctx context.Context, active *calls.ActiveCall) {
	if active == nil || active.RecordingStarted || active.BridgeID == "" {
		return
	}
	if active.State != calls.StateBridged && active.State != calls.StateAnswered {
		return
	}
	if !active.MarkEvent("recording:evaluate") {
		return
	}

	orgDefault, err := c.repo.GetTenantRecordCallsByDefault(ctx, active.TenantID)
	if err != nil {
		slog.Warn("recording policy tenant lookup failed", "error", err, "callId", active.CallID)
		orgDefault = false
	}

	participants := make([]recording.Participant, 0, 2)
	if active.FromExtensionID != uuid.Nil {
		mode, modeErr := c.repo.GetExtensionRecordingPolicy(ctx, active.FromExtensionID)
		if modeErr == nil {
			participants = append(participants, recording.Participant{
				ExtensionID: active.FromExtensionID,
				Mode:        mode,
				Active:      true,
			})
		}
	}
	if active.ToExtensionID != uuid.Nil && active.ToExtensionID != active.FromExtensionID {
		mode, modeErr := c.repo.GetExtensionRecordingPolicy(ctx, active.ToExtensionID)
		if modeErr == nil {
			participants = append(participants, recording.Participant{
				ExtensionID: active.ToExtensionID,
				Mode:        mode,
				Active:      true,
			})
		}
	}

	decision := recording.Resolve(orgDefault, true, participants, time.Now().UTC())
	if !decision.ShouldRecord {
		return
	}

	existing, existingErr := c.repo.GetCallRecordingByCallID(ctx, active.CallID)
	if existingErr == nil && existing != nil {
		active.RecordingID = existing.ID
		active.RecordingStarted = true
		active.LiveRecordingName = existing.ID.String()
		return
	}

	recordingID := uuid.New()
	now := time.Now().UTC()
	storageKey := c.repo.StorageKeyForRecording(active.TenantID, recordingID, now)
	metadata := map[string]any{
		"policyReason":              decision.Reason,
		"participantExtensionIds":   uuidListToStrings(decision.ParticipantExtensionIDs),
		"orgRecordCallsByDefault":   orgDefault,
		"resolvedAt":              decision.ResolvedAt.Format(time.RFC3339),
	}
	if err := c.repo.CreateCallRecording(ctx, recordingID, active.TenantID, active.CallID, storageKey, metadata); err != nil {
		slog.Warn("recording row create failed", "error", err, "callId", active.CallID)
		return
	}

	liveName := recordingID.String()
	_, recErr := c.client.Bridge().Record(bridgeKey(active.BridgeID), liveName, &ari.RecordingOptions{
		Format: "wav",
		Exists: "overwrite",
	})
	if recErr != nil {
		slog.Warn("bridge recording start failed", "error", recErr, "callId", active.CallID)
		_ = c.repo.MarkCallRecordingFailed(ctx, recordingID, "start_failed", "bridge_record_failed")
		return
	}

	active.RecordingID = recordingID
	active.RecordingStorageKey = storageKey
	active.LiveRecordingName = liveName
	active.RecordingStarted = true
	active.RecordingStartedAt = now
	c.registry.Put(active)
	_ = c.repo.InsertCallEvent(ctx, active.TenantID, active.CallID, "RECORDING_STARTED", map[string]any{
		"recordingId": recordingID.String(),
		"reason":      decision.Reason,
	})
}

func (c *Controller) finalizeRecording(ctx context.Context, active *calls.ActiveCall) {
	if active == nil || !active.RecordingStarted || active.RecordingID == uuid.Nil {
		return
	}
	if !active.MarkEvent("recording:finalize") {
		return
	}

	recordingID := active.RecordingID
	liveName := active.LiveRecordingName
	_ = c.repo.MarkCallRecordingProcessing(ctx, recordingID)

	if liveName != "" {
		lKey := ari.NewKey(ari.LiveRecordingKey, liveName)
		_ = c.client.LiveRecording().Stop(lKey)
	}

	go c.completeRecordingFile(context.Background(), active.TenantID, active.CallID, recordingID, liveName, active.RecordingStorageKey, active.RecordingStartedAt)
}

func (c *Controller) completeRecordingFile(
	ctx context.Context,
	tenantID, callID, recordingID uuid.UUID,
	liveName, storageKey string,
	startedAt time.Time,
) {
	root := strings.TrimSpace(os.Getenv("CALL_RECORDING_LOCAL_ROOT"))
	if root == "" {
		root = "/var/lib/pbx/recordings"
	}

	stagingPath := filepath.Join(root, liveName+".wav")
	finalPath, err := safeJoin(root, storageKey)
	if err != nil {
		_ = c.repo.MarkCallRecordingFailed(ctx, recordingID, "path_error", "invalid_storage_key")
		return
	}

	deadline := time.Now().Add(10 * time.Second)
	var info os.FileInfo
	for time.Now().Before(deadline) {
		info, err = os.Stat(stagingPath)
		if err == nil && info.Size() > 0 {
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	if err != nil || info == nil || info.Size() == 0 {
		_ = c.repo.MarkCallRecordingFailed(ctx, recordingID, "file_missing", "recording_file_not_found")
		return
	}

	if err := os.MkdirAll(filepath.Dir(finalPath), 0o750); err != nil {
		_ = c.repo.MarkCallRecordingFailed(ctx, recordingID, "mkdir_failed", "storage_prepare_failed")
		return
	}
	if err := os.Rename(stagingPath, finalPath); err != nil {
		if copyErr := copyFile(stagingPath, finalPath); copyErr != nil {
			_ = c.repo.MarkCallRecordingFailed(ctx, recordingID, "finalize_failed", "recording_move_failed")
			return
		}
		_ = os.Remove(stagingPath)
	}
	_ = os.Chmod(finalPath, 0o640)

	durationMs := int(time.Since(startedAt).Milliseconds())
	if durationMs < 0 {
		durationMs = 0
	}
	finalInfo, statErr := os.Stat(finalPath)
	if statErr != nil {
		_ = c.repo.MarkCallRecordingFailed(ctx, recordingID, "stat_failed", "recording_stat_failed")
		return
	}

	if err := c.repo.FinalizeCallRecording(ctx, recordingID, "available", storageKey, finalInfo.Size(), durationMs, "", ""); err != nil {
		slog.Warn("recording finalize db update failed", "error", err, "recordingId", recordingID)
		return
	}
	_ = c.repo.InsertCallEvent(ctx, tenantID, callID, "RECORDING_READY", map[string]any{
		"recordingId": recordingID.String(),
		"durationMs":  durationMs,
		"sizeBytes":   finalInfo.Size(),
	})
}

func safeJoin(root, storageKey string) (string, error) {
	cleanKey := filepath.Clean(strings.ReplaceAll(storageKey, "\\", "/"))
	if cleanKey == "." || strings.HasPrefix(cleanKey, "..") || strings.Contains(cleanKey, ".."+string(os.PathSeparator)) {
		return "", fmt.Errorf("invalid key")
	}
	resolved := filepath.Join(root, cleanKey)
	if resolved != root && !strings.HasPrefix(resolved, root+string(os.PathSeparator)) {
		return "", fmt.Errorf("outside root")
	}
	return resolved, nil
}

func copyFile(src, dest string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o640)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

func uuidListToStrings(ids []uuid.UUID) []string {
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		out = append(out, id.String())
	}
	return out
}

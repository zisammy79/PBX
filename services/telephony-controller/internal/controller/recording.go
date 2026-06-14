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
	"github.com/pbx-platform/telephony-controller/internal/repository"
)

const recordingFinalizeWait = 15 * time.Second

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
		slog.Warn("recording.policy_resolved", "event", "recording.policy_lookup_failed", "callId", active.CallID, "error", err)
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

	slog.Info("recording.policy_resolved",
		"event", "recording.policy_resolved",
		"callId", active.CallID,
		"shouldRecord", decision.ShouldRecord,
		"reason", decision.Reason,
	)

	existing, existingErr := c.repo.GetCallRecordingByCallID(ctx, active.CallID)
	if existingErr == nil && existing != nil {
		active.RecordingID = existing.ID
		active.RecordingStarted = true
		active.LiveRecordingName = existing.ID.String()
		if existing.StorageKey != "" {
			active.RecordingStorageKey = existing.StorageKey
		}
		return
	}

	recordingID := uuid.New()
	now := time.Now().UTC()
	storageKey := c.repo.StorageKeyForRecording(active.TenantID, recordingID, now)
	metadata := map[string]any{
		"policyReason":            decision.Reason,
		"participantExtensionIds": uuidListToStrings(decision.ParticipantExtensionIDs),
		"orgRecordCallsByDefault": orgDefault,
		"resolvedAt":              decision.ResolvedAt.Format(time.RFC3339),
	}
	if err := c.repo.CreateCallRecording(ctx, recordingID, active.TenantID, active.CallID, storageKey, metadata); err != nil {
		slog.Warn("recording.start_failed", "event", "recording.row_create_failed", "callId", active.CallID, "error", err)
		return
	}

	liveName := recordingID.String()
	slog.Info("recording.start_requested",
		"event", "recording.start_requested",
		"callId", active.CallID,
		"recordingId", recordingID,
	)

	_, recErr := c.client.Bridge().Record(bridgeKey(active.BridgeID), liveName, &ari.RecordingOptions{
		Format: "wav",
		Exists: "overwrite",
	})
	if recErr != nil {
		slog.Warn("recording.start_failed",
			"event", "recording.start_failed",
			"callId", active.CallID,
			"recordingId", recordingID,
			"error", recErr,
		)
		_ = c.repo.MarkCallRecordingFailed(ctx, recordingID, "start_failed", "bridge_record_failed")
		return
	}

	if err := c.repo.MarkCallRecordingRecording(ctx, recordingID); err != nil {
		slog.Warn("recording.start_failed", "event", "recording.status_update_failed", "recordingId", recordingID, "error", err)
	}

	active.RecordingID = recordingID
	active.RecordingStorageKey = storageKey
	active.LiveRecordingName = liveName
	active.RecordingStarted = true
	active.RecordingStartedAt = now
	c.registry.Put(active)

	slog.Info("recording.started",
		"event", "recording.started",
		"callId", active.CallID,
		"recordingId", recordingID,
	)
	_ = c.repo.InsertCallEvent(ctx, active.TenantID, active.CallID, "RECORDING_STARTED", map[string]any{
		"recordingId": recordingID.String(),
		"reason":      decision.Reason,
	})
}

func (c *Controller) finalizeRecording(ctx context.Context, active *calls.ActiveCall) {
	if active == nil {
		return
	}

	recordingID := active.RecordingID
	liveName := active.LiveRecordingName
	storageKey := active.RecordingStorageKey
	startedAt := active.RecordingStartedAt

	if recordingID == uuid.Nil {
		row, err := c.repo.GetCallRecordingByCallID(ctx, active.CallID)
		if err != nil || row == nil {
			return
		}
		if row.Status == "available" || row.Status == "failed" || row.Status == "deleted" {
			return
		}
		recordingID = row.ID
		liveName = row.ID.String()
		storageKey = row.StorageKey
		if storageKey == "" {
			storageKey = c.repo.StorageKeyForRecording(row.TenantID, row.ID, time.Now().UTC())
		}
		if startedAt.IsZero() {
			startedAt = time.Now().UTC()
		}
	} else if !active.RecordingStarted {
		return
	}

	if !active.MarkEvent("recording:finalize:" + recordingID.String()) {
		return
	}

	slog.Info("recording.stop_requested",
		"event", "recording.stop_requested",
		"callId", active.CallID,
		"recordingId", recordingID,
	)
	_ = c.repo.MarkCallRecordingProcessing(ctx, recordingID)

	if liveName != "" && c.client != nil {
		lKey := ari.NewKey(ari.LiveRecordingKey, liveName)
		_ = c.client.LiveRecording().Stop(lKey)
	}

	go c.completeRecordingFile(context.Background(), active.TenantID, active.CallID, recordingID, liveName, storageKey, startedAt)
}

func (c *Controller) completeRecordingFile(
	ctx context.Context,
	tenantID, callID, recordingID uuid.UUID,
	liveName, storageKey string,
	startedAt time.Time,
) {
	// Finalization can take longer than an HTTP request; never tie DB writes to caller ctx.
	dbCtx := context.Background()

	slog.Info("recording.processing",
		"event", "recording.processing",
		"callId", callID,
		"recordingId", recordingID,
	)

	root := recordingLocalRoot()
	stagingPath := filepath.Join(root, liveName+".wav")
	finalPath, err := safeJoin(root, storageKey)
	if err != nil {
		slog.Warn("recording.failed", "event", "recording.failed", "recordingId", recordingID, "code", "path_error")
		c.markRecordingFailed(dbCtx, recordingID, "path_error", "invalid_storage_key")
		return
	}

	deadline := time.Now().Add(recordingFinalizeWait)
	var info os.FileInfo
	for time.Now().Before(deadline) {
		info, err = os.Stat(stagingPath)
		if err == nil && info.Size() > 0 {
			break
		}
		time.Sleep(250 * time.Millisecond)
	}
	if err != nil || info == nil {
		slog.Warn("recording.failed",
			"event", "recording.failed",
			"recordingId", recordingID,
			"code", "recording_file_missing",
		)
		c.markRecordingFailed(dbCtx, recordingID, "recording_file_missing", "recording_file_not_found")
		return
	}
	if info.Size() == 0 {
		slog.Warn("recording.failed",
			"event", "recording.failed",
			"recordingId", recordingID,
			"code", "recording_file_empty",
		)
		c.markRecordingFailed(dbCtx, recordingID, "recording_file_empty", "recording_file_empty")
		return
	}

	slog.Info("recording.file_found",
		"event", "recording.file_found",
		"recordingId", recordingID,
		"sizeBytes", info.Size(),
	)

	if err := os.MkdirAll(filepath.Dir(finalPath), 0o755); err != nil {
		c.markRecordingFailed(dbCtx, recordingID, "mkdir_failed", "storage_prepare_failed")
		return
	}
	ensureRecordingDirsTraversable(root, finalPath)
	if err := os.Rename(stagingPath, finalPath); err != nil {
		if copyErr := copyFile(stagingPath, finalPath); copyErr != nil {
			c.markRecordingFailed(dbCtx, recordingID, "finalize_failed", "recording_move_failed")
			return
		}
		_ = os.Remove(stagingPath)
	}
	_ = os.Chmod(finalPath, 0o644)

	durationMs := int(time.Since(startedAt).Milliseconds())
	if durationMs < 0 {
		durationMs = 0
	}
	finalInfo, statErr := os.Stat(finalPath)
	if statErr != nil {
		c.markRecordingFailed(dbCtx, recordingID, "stat_failed", "recording_stat_failed")
		return
	}

	if err := c.repo.FinalizeCallRecording(dbCtx, recordingID, "available", storageKey, finalInfo.Size(), durationMs, "", ""); err != nil {
		slog.Warn("recording.failed", "event", "recording.db_finalize_failed", "recordingId", recordingID, "error", err)
		return
	}

	slog.Info("recording.finalized",
		"event", "recording.finalized",
		"recordingId", recordingID,
		"durationMs", durationMs,
		"sizeBytes", finalInfo.Size(),
	)
	_ = c.repo.InsertCallEvent(dbCtx, tenantID, callID, "RECORDING_READY", map[string]any{
		"recordingId": recordingID.String(),
		"durationMs":  durationMs,
		"sizeBytes":   finalInfo.Size(),
	})
}

func ensureRecordingDirsTraversable(root, finalPath string) {
	dir := filepath.Dir(finalPath)
	for dir != root && strings.HasPrefix(dir, root+string(os.PathSeparator)) {
		_ = os.Chmod(dir, 0o755)
		dir = filepath.Dir(dir)
	}
	_ = os.Chmod(root, 0o2775)
}

func (c *Controller) markRecordingFailed(ctx context.Context, recordingID uuid.UUID, code, message string) {
	if err := c.repo.MarkCallRecordingFailed(ctx, recordingID, code, message); err != nil {
		slog.Warn("recording.failed",
			"event", "recording.db_mark_failed",
			"recordingId", recordingID,
			"code", code,
			"error", err,
		)
	}
}

func recordingLocalRoot() string {
	root := strings.TrimSpace(os.Getenv("CALL_RECORDING_LOCAL_ROOT"))
	if root == "" {
		root = "/var/lib/pbx/recordings"
	}
	return root
}

func (c *Controller) ReconcileStaleRecordings(ctx context.Context, olderThan time.Duration) (int, error) {
	rows, err := c.repo.ListStaleRecordings(ctx, olderThan)
	if err != nil {
		return 0, err
	}
	reconciled := 0
	for _, row := range rows {
		if err := c.reconcileStaleRecording(ctx, row); err == nil {
			reconciled++
		}
	}
	return reconciled, nil
}

func (c *Controller) ReconcileRecordingByID(ctx context.Context, recordingID uuid.UUID) error {
	row, err := c.repo.GetCallRecordingByID(ctx, recordingID)
	if err != nil {
		return err
	}
	return c.reconcileStaleRecording(ctx, repository.StaleRecordingRow{
		ID:         row.ID,
		TenantID:   row.TenantID,
		CallID:     row.CallID,
		Status:     row.Status,
		StorageKey: row.StorageKey,
		StartedAt:  time.Now().UTC(),
	})
}

func (c *Controller) reconcileStaleRecording(ctx context.Context, row repository.StaleRecordingRow) error {
	if row.Status == "available" || row.Status == "failed" || row.Status == "deleted" {
		return nil
	}
	liveName := row.ID.String()
	if row.StorageKey == "" {
		row.StorageKey = c.repo.StorageKeyForRecording(row.TenantID, row.ID, row.StartedAt)
	}
	if row.Status != "processing" {
		_ = c.repo.MarkCallRecordingProcessing(context.Background(), row.ID)
	}
	c.completeRecordingFile(context.Background(), row.TenantID, row.CallID, row.ID, liveName, row.StorageKey, row.StartedAt)
	return nil
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

func (c *Controller) StartRecordingMaintenance(ctx context.Context, interval, staleAfter time.Duration) {
	if interval <= 0 {
		interval = time.Minute
	}
	if staleAfter <= 0 {
		staleAfter = 2 * time.Minute
	}
	ticker := time.NewTicker(interval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				count, err := c.ReconcileStaleRecordings(ctx, staleAfter)
				if err != nil {
					slog.Warn("recording reconcile failed", "error", err)
					continue
				}
				if count > 0 {
					slog.Info("recording reconcile complete", "count", count)
				}
			}
		}
	}()
}

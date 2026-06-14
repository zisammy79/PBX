package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/pbx-platform/telephony-controller/internal/recording"
)

type StaleRecordingRow struct {
	ID         uuid.UUID
	TenantID   uuid.UUID
	CallID     uuid.UUID
	Status     string
	StorageKey string
	StartedAt  time.Time
}

func (r *Repository) GetTenantRecordCallsByDefault(ctx context.Context, tenantID uuid.UUID) (bool, error) {
	var value []byte
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT value FROM tenant_settings
			WHERE tenant_id = $1 AND key = 'telephony.recording'
		`, tenantID).Scan(&value)
	})
	if err != nil {
		return false, nil
	}
	var payload struct {
		RecordCallsByDefault bool `json:"recordCallsByDefault"`
	}
	if json.Unmarshal(value, &payload) != nil {
		return false, nil
	}
	return payload.RecordCallsByDefault, nil
}

func (r *Repository) GetExtensionRecordingPolicy(ctx context.Context, extensionID uuid.UUID) (recording.PolicyMode, error) {
	var mode string
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT recording_policy_mode FROM extensions WHERE id = $1 AND status = 'active'
		`, extensionID).Scan(&mode)
	})
	if err != nil {
		return recording.PolicyInherit, err
	}
	return recording.PolicyMode(mode), nil
}

type CallRecordingRow struct {
	ID         uuid.UUID
	TenantID   uuid.UUID
	CallID     uuid.UUID
	Status     string
	StorageKey string
}

func (r *Repository) GetCallRecordingByCallID(ctx context.Context, callID uuid.UUID) (*CallRecordingRow, error) {
	var row CallRecordingRow
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT id, tenant_id, call_id, status, COALESCE(storage_key, '')
			FROM call_recordings WHERE call_id = $1 LIMIT 1
		`, callID).Scan(&row.ID, &row.TenantID, &row.CallID, &row.Status, &row.StorageKey)
	})
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *Repository) GetCallRecordingByID(ctx context.Context, recordingID uuid.UUID) (*CallRecordingRow, error) {
	var row CallRecordingRow
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT id, tenant_id, call_id, status, COALESCE(storage_key, '')
			FROM call_recordings WHERE id = $1 LIMIT 1
		`, recordingID).Scan(&row.ID, &row.TenantID, &row.CallID, &row.Status, &row.StorageKey)
	})
	if err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *Repository) CreateCallRecording(
	ctx context.Context,
	recordingID, tenantID, callID uuid.UUID,
	storageKey string,
	metadata map[string]any,
) error {
	body, _ := json.Marshal(metadata)
	now := time.Now().UTC()
	return r.withBypass(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO call_recordings (
				id, tenant_id, call_id, status, storage_backend, storage_key, format, mime_type,
				started_at, metadata, created_at, updated_at
			) VALUES ($1,$2,$3,'starting','local',$4,'wav','audio/wav',$5,$6,$5,$5)
			ON CONFLICT (call_id) DO NOTHING
		`, recordingID, tenantID, callID, storageKey, now, body)
		return err
	})
}

func (r *Repository) MarkCallRecordingRecording(ctx context.Context, recordingID uuid.UUID) error {
	return r.withBypass(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			UPDATE call_recordings SET status = 'recording', updated_at = NOW()
			WHERE id = $1 AND status IN ('starting', 'pending')
		`, recordingID)
		return err
	})
}

func (r *Repository) MarkCallRecordingProcessing(ctx context.Context, recordingID uuid.UUID) error {
	return r.withBypass(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			UPDATE call_recordings SET status = 'processing', updated_at = NOW()
			WHERE id = $1 AND status IN ('starting', 'pending', 'recording')
		`, recordingID)
		return err
	})
}

func (r *Repository) FinalizeCallRecording(
	ctx context.Context,
	recordingID uuid.UUID,
	status string,
	storageKey string,
	fileSizeBytes int64,
	durationMs int,
	failureCode, failureMessage string,
) error {
	return r.withBypass(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			UPDATE call_recordings SET
				status = $2::recording_status,
				storage_key = COALESCE(NULLIF($3, ''), storage_key),
				file_size_bytes = NULLIF($4, 0),
				duration_ms = NULLIF($5, 0),
				duration_seconds = CASE WHEN $5 > 0 THEN GREATEST(1, ($5 + 999) / 1000) ELSE duration_seconds END,
				completed_at = NOW(),
				available_at = CASE WHEN $2::text = 'available' THEN NOW() ELSE available_at END,
				failure_code = NULLIF($6, ''),
				failure_message = NULLIF($7, ''),
				updated_at = NOW()
			WHERE id = $1
		`, recordingID, status, storageKey, fileSizeBytes, durationMs, failureCode, failureMessage)
		return err
	})
}

func (r *Repository) MarkCallRecordingFailed(ctx context.Context, recordingID uuid.UUID, code, message string) error {
	return r.FinalizeCallRecording(ctx, recordingID, "failed", "", 0, 0, code, message)
}

func (r *Repository) ListStaleRecordings(ctx context.Context, olderThan time.Duration) ([]StaleRecordingRow, error) {
	cutoff := time.Now().UTC().Add(-olderThan)
	var rows []StaleRecordingRow
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		result, err := tx.Query(ctx, `
			SELECT cr.id, cr.tenant_id, cr.call_id, cr.status, COALESCE(cr.storage_key, ''), cr.started_at
			FROM call_recordings cr
			INNER JOIN calls c ON c.id = cr.call_id
			WHERE cr.status IN ('starting', 'recording', 'processing')
			  AND c.status IN ('completed', 'failed', 'cancelled')
			  AND cr.updated_at < $1
		`, cutoff)
		if err != nil {
			return err
		}
		defer result.Close()
		for result.Next() {
			var row StaleRecordingRow
			if err := result.Scan(&row.ID, &row.TenantID, &row.CallID, &row.Status, &row.StorageKey, &row.StartedAt); err != nil {
				return err
			}
			rows = append(rows, row)
		}
		return result.Err()
	})
	return rows, err
}

func (r *Repository) StorageKeyForRecording(tenantID, recordingID uuid.UUID, now time.Time) string {
	return recording.BuildStorageKey(tenantID, recordingID, now)
}

func (r *Repository) SanitizeFailureMessage(err error) string {
	if err == nil {
		return ""
	}
	return fmt.Sprintf("recording_error:%T", err)
}

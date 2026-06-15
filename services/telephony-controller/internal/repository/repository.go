package repository

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type CallRecord struct {
	ID                uuid.UUID
	TenantID          uuid.UUID
	CorrelationID     uuid.UUID
	Direction         string
	Status            string
	FromExtensionID   *uuid.UUID
	ToExtensionID     *uuid.UUID
	CallerNumber      string
	CalleeNumber      string
	AsteriskChannelID string
	AsteriskBridgeID  string
	StartedAt         time.Time
	AnsweredAt        *time.Time
	EndedAt           *time.Time
	DurationSeconds   *int
	BillableSeconds   *int
	HangupCause       string
}

type ExtensionInfo struct {
	ID                 uuid.UUID
	TenantID           uuid.UUID
	TenantSlug         string
	ExtensionNumber    string
	AsteriskEndpointID string
}

type Repository struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Repository {
	return &Repository{pool: pool}
}

func (r *Repository) Connect(ctx context.Context, url string) error {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return err
	}
	r.pool = pool
	return pool.Ping(ctx)
}

func (r *Repository) Close() {
	if r.pool != nil {
		r.pool.Close()
	}
}

func (r *Repository) withBypass(ctx context.Context, fn func(pgx.Tx) error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `SELECT set_config('app.bypass_rls', 'true', true)`); err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *Repository) LookupExtensionByEndpoint(ctx context.Context, endpointID string) (*ExtensionInfo, error) {
	var ext ExtensionInfo
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT e.id, e.tenant_id, t.slug, e.extension_number, e.asterisk_endpoint_id
			FROM extensions e
			JOIN tenants t ON t.id = e.tenant_id
			WHERE e.asterisk_endpoint_id = $1 AND e.status = 'active' AND t.status = 'active'
		`, endpointID).Scan(&ext.ID, &ext.TenantID, &ext.TenantSlug, &ext.ExtensionNumber, &ext.AsteriskEndpointID)
	})
	if err != nil {
		return nil, err
	}
	return &ext, nil
}

func (r *Repository) LookupExtensionByTenantNumber(ctx context.Context, tenantSlug, number string) (*ExtensionInfo, error) {
	var ext ExtensionInfo
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT e.id, e.tenant_id, t.slug, e.extension_number, e.asterisk_endpoint_id
			FROM extensions e
			JOIN tenants t ON t.id = e.tenant_id
			WHERE t.slug = $1 AND e.extension_number = $2 AND e.status = 'active' AND t.status = 'active'
		`, tenantSlug, number).Scan(&ext.ID, &ext.TenantID, &ext.TenantSlug, &ext.ExtensionNumber, &ext.AsteriskEndpointID)
	})
	if err != nil {
		return nil, err
	}
	return &ext, nil
}

func (r *Repository) ListCalleeEndpointsForExtension(ctx context.Context, tenantID, extensionID uuid.UUID, fallbackEndpointID string) ([]string, error) {
	endpoints := make([]string, 0, 4)
	seen := map[string]bool{}
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT COALESCE(d.asterisk_endpoint_id, e.asterisk_endpoint_id) AS endpoint_id
			FROM sip_devices d
			JOIN extensions e ON e.id = d.extension_id
			JOIN tenants t ON t.id = d.tenant_id
			WHERE d.tenant_id = $1
			  AND d.extension_id = $2
			  AND e.status = 'active'
			  AND t.status = 'active'
			  AND d.status IN ('ready', 'provisioning')
			ORDER BY d.created_at ASC
		`, tenantID, extensionID)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var endpointID string
			if err := rows.Scan(&endpointID); err != nil {
				return err
			}
			if endpointID != "" && !seen[endpointID] {
				seen[endpointID] = true
				endpoints = append(endpoints, endpointID)
			}
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	if len(endpoints) == 0 && fallbackEndpointID != "" {
		endpoints = append(endpoints, fallbackEndpointID)
	}
	return endpoints, nil
}

func (r *Repository) IsTenantCallable(ctx context.Context, tenantSlug string) (bool, error) {
	var status string
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `SELECT status FROM tenants WHERE slug = $1`, tenantSlug).Scan(&status)
	})
	if err != nil {
		return false, err
	}
	return status == "active", nil
}

func (r *Repository) CreateCall(ctx context.Context, rec CallRecord) error {
	return r.withBypass(ctx, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext('max_concurrent_calls'))`, rec.TenantID.String()); err != nil {
			return err
		}
		limit, err := r.concurrentCallLimit(ctx, tx, rec.TenantID)
		if err != nil {
			return err
		}
		if limit > 0 {
			var used int
			if err := tx.QueryRow(ctx, `
				SELECT COUNT(*)::int FROM calls
				WHERE tenant_id = $1
				  AND ended_at IS NULL
				  AND status IN ('initiating', 'ringing', 'answered', 'held')
			`, rec.TenantID).Scan(&used); err != nil {
				return err
			}
			if used >= limit {
				return fmt.Errorf("concurrent_call_limit_reached")
			}
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO calls (
				id, tenant_id, correlation_id, direction, status,
				from_extension_id, to_extension_id, caller_number, callee_number,
				asterisk_channel_id, started_at, created_at, updated_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
		`, rec.ID, rec.TenantID, rec.CorrelationID, rec.Direction, rec.Status,
			rec.FromExtensionID, rec.ToExtensionID, rec.CallerNumber, rec.CalleeNumber,
			rec.AsteriskChannelID, rec.StartedAt)
		return err
	})
}

func (r *Repository) concurrentCallLimit(ctx context.Context, tx pgx.Tx, tenantID uuid.UUID) (int, error) {
	var planID *uuid.UUID
	if err := tx.QueryRow(ctx, `SELECT plan_id FROM tenants WHERE id = $1`, tenantID).Scan(&planID); err != nil {
		return 0, err
	}

	var override *int
	err := tx.QueryRow(ctx, `
		SELECT limit_value::int
		FROM tenant_limit_overrides
		WHERE tenant_id = $1 AND dimension = 'max_concurrent_calls'
		LIMIT 1
	`, tenantID).Scan(&override)
	if err != nil && err != pgx.ErrNoRows {
		return 0, err
	}
	if override != nil {
		return *override, nil
	}

	if planID == nil {
		return 0, nil
	}

	var included *int
	err = tx.QueryRow(ctx, `
		SELECT included_quantity::int
		FROM plan_entitlements
		WHERE plan_id = $1 AND meter_name = 'max_concurrent_calls'
		LIMIT 1
	`, *planID).Scan(&included)
	if err != nil && err != pgx.ErrNoRows {
		return 0, err
	}
	if included == nil {
		return 0, nil
	}
	return *included, nil
}

func (r *Repository) UpdateCallStatus(ctx context.Context, callID uuid.UUID, status string, fields map[string]any) error {
	return r.withBypass(ctx, func(tx pgx.Tx) error {
		query := `UPDATE calls SET status = $2, updated_at = NOW()`
		args := []any{callID, status}
		i := 3
		if v, ok := fields["answered_at"]; ok {
			query += fmt.Sprintf(", answered_at = $%d", i)
			args = append(args, v)
			i++
		}
		if v, ok := fields["ended_at"]; ok {
			query += fmt.Sprintf(", ended_at = $%d", i)
			args = append(args, v)
			i++
		}
		if v, ok := fields["asterisk_bridge_id"]; ok {
			query += fmt.Sprintf(", asterisk_bridge_id = $%d", i)
			args = append(args, v)
			i++
		}
		if v, ok := fields["duration_seconds"]; ok {
			query += fmt.Sprintf(", duration_seconds = $%d", i)
			args = append(args, v)
			i++
		}
		if v, ok := fields["billable_seconds"]; ok {
			query += fmt.Sprintf(", billable_seconds = $%d", i)
			args = append(args, v)
			i++
		}
		if v, ok := fields["hangup_cause"]; ok {
			query += fmt.Sprintf(", hangup_cause = $%d", i)
			args = append(args, v)
			i++
		}
		query += fmt.Sprintf(" WHERE id = $1")
		_, err := tx.Exec(ctx, query, args...)
		return err
	})
}

func (r *Repository) InsertCallEvent(ctx context.Context, tenantID, callID uuid.UUID, eventType string, payload map[string]any) error {
	body, _ := json.Marshal(payload)
	return r.withBypass(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO call_events (tenant_id, call_id, event_type, payload, occurred_at)
			VALUES ($1,$2,$3,$4,NOW())
		`, tenantID, callID, eventType, body)
		return err
	})
}

func (r *Repository) InsertCallLeg(ctx context.Context, tenantID, callID uuid.UUID, legType, channelID, endpointID string) error {
	return r.withBypass(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO call_legs (tenant_id, call_id, leg_type, channel_id, endpoint_id, started_at)
			VALUES ($1,$2,$3,$4,$5,NOW())
		`, tenantID, callID, legType, channelID, endpointID)
		return err
	})
}

func (r *Repository) UpdateCallLegAnswered(ctx context.Context, tenantID, callID uuid.UUID, channelID string, answered time.Time) error {
	return r.withBypass(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			UPDATE call_legs SET answered_at = $4
			WHERE tenant_id = $1 AND call_id = $2 AND channel_id = $3 AND answered_at IS NULL
		`, tenantID, callID, channelID, answered)
		return err
	})
}

func (r *Repository) EndCallLegs(ctx context.Context, tenantID, callID uuid.UUID, ended time.Time) error {
	return r.withBypass(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			UPDATE call_legs SET ended_at = $3
			WHERE tenant_id = $1 AND call_id = $2 AND ended_at IS NULL
		`, tenantID, callID, ended)
		return err
	})
}

func (r *Repository) UpdateCallLegChannel(ctx context.Context, tenantID, callID uuid.UUID, legType, channelID string) error {
	return r.withBypass(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			UPDATE call_legs SET channel_id = $4
			WHERE tenant_id = $1 AND call_id = $2 AND leg_type = $3
		`, tenantID, callID, legType, channelID)
		return err
	})
}

func (r *Repository) WriteUsageEvent(ctx context.Context, tenantID, callID, correlationID uuid.UUID, quantity int, start, end time.Time) (bool, error) {
	idempotencyKey := fmt.Sprintf("internal_call:%s", callID.String())
	hashInput, _ := json.Marshal(map[string]any{
		"tenantId":       tenantID.String(),
		"callId":         callID.String(),
		"idempotencyKey": idempotencyKey,
	})
	sum := sha256.Sum256(hashInput)
	integrityHash := hex.EncodeToString(sum[:])

	inserted := false
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			INSERT INTO usage_events (
				idempotency_key, tenant_id, call_id, resource_type, meter_name,
				quantity, unit, event_start, event_end, event_timestamp, source,
				correlation_id, integrity_hash
			) VALUES ($1,$2,$3,'internal_call','internal_call_seconds',$4,'seconds',$5,$6,NOW(),'telephony-controller',$7,$8)
			ON CONFLICT (idempotency_key) DO NOTHING
		`, idempotencyKey, tenantID, callID, fmt.Sprintf("%d", quantity), start, end, correlationID, integrityHash)
		if err != nil {
			return err
		}
		inserted = tag.RowsAffected() > 0
		return nil
	})
	return inserted, err
}

func (r *Repository) UpsertRegistration(ctx context.Context, tenantID, extensionID uuid.UUID, registered bool, contact, userAgent, sourceIP string) error {
	return r.withBypass(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO sip_registrations (tenant_id, extension_id, is_registered, contact, user_agent, source_ip, registered_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $3 THEN NOW() ELSE NULL END, NOW())
			ON CONFLICT (extension_id) DO UPDATE SET
				is_registered = EXCLUDED.is_registered,
				contact = EXCLUDED.contact,
				user_agent = EXCLUDED.user_agent,
				source_ip = EXCLUDED.source_ip,
				registered_at = CASE WHEN EXCLUDED.is_registered THEN NOW() ELSE sip_registrations.registered_at END,
				updated_at = NOW()
		`, tenantID, extensionID, registered, contact, userAgent, sourceIP)
		return err
	})
}

func (r *Repository) Pool() *pgxpool.Pool {
	return r.pool
}

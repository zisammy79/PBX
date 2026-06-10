package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type AiAgentInfo struct {
	ID                   uuid.UUID
	TenantID             uuid.UUID
	TenantSlug           string
	RouteNumber          string
	TransferExtensionID  uuid.UUID
	TransferNumber       string
	ActiveVersionID      uuid.UUID
	ProviderConnectionID uuid.UUID
	Provider             string
	Model                string
	Voice                string
	Language             string
	SystemInstructions   string
	OpeningMessage       string
	AllowedTools         []string
	MaxDurationSeconds   int
}

type AiSessionRecord struct {
	ID                   uuid.UUID
	TenantID             uuid.UUID
	CallID               uuid.UUID
	AgentID              uuid.UUID
	AgentVersionID       uuid.UUID
	ProviderConnectionID uuid.UUID
	ProviderType         string
	CorrelationID        uuid.UUID
}

func (r *Repository) LookupAiAgentByRoute(ctx context.Context, tenantSlug, routeNumber string) (*AiAgentInfo, error) {
	var info AiAgentInfo
	var toolsJSON []byte
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT a.id, a.tenant_id, t.slug, a.route_number, a.transfer_extension_id,
			       te.extension_number, av.id, av.provider_connection_id, av.provider, av.model,
			       COALESCE(av.voice, ''), COALESCE(av.language, 'en'),
			       COALESCE(av.system_instructions, ''), COALESCE(av.opening_message, ''),
			       av.allowed_tools, COALESCE(av.max_duration_seconds, 3600)
			FROM ai_agents a
			JOIN tenants t ON t.id = a.tenant_id
			JOIN ai_agent_versions av ON av.id = a.active_version_id
			JOIN extensions te ON te.id = a.transfer_extension_id
			WHERE t.slug = $1 AND a.route_number = $2
			  AND a.is_active = true AND a.status = 'active'
			  AND t.status = 'active'
		`, tenantSlug, routeNumber).Scan(
			&info.ID, &info.TenantID, &info.TenantSlug, &info.RouteNumber, &info.TransferExtensionID,
			&info.TransferNumber, &info.ActiveVersionID, &info.ProviderConnectionID, &info.Provider,
			&info.Model, &info.Voice, &info.Language, &info.SystemInstructions, &info.OpeningMessage,
			&toolsJSON, &info.MaxDurationSeconds,
		)
	})
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(toolsJSON, &info.AllowedTools)
	return &info, nil
}

func (r *Repository) CreateAiSession(ctx context.Context, rec AiSessionRecord) error {
	return r.withBypass(ctx, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO ai_sessions (
				id, tenant_id, call_id, agent_id, agent_version_id, provider_connection_id,
				provider_type, status, state, correlation_id, diagnostics, timing, started_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,'connecting','CREATED',$8,'{}','{}',NOW())
		`, rec.ID, rec.TenantID, rec.CallID, rec.AgentID, rec.AgentVersionID, rec.ProviderConnectionID,
			rec.ProviderType, rec.CorrelationID)
		return err
	})
}

func (r *Repository) UpdateAiSessionState(ctx context.Context, sessionID uuid.UUID, state, status string, fields map[string]any) error {
	return r.withBypass(ctx, func(tx pgx.Tx) error {
		query := `UPDATE ai_sessions SET state = $2, status = $3`
		args := []any{sessionID, state, status}
		i := 4
		if v, ok := fields["provider_session_id"]; ok {
			query += `, provider_session_id = $` + fmt.Sprint(i)
			args = append(args, v)
			i++
		}
		if v, ok := fields["diagnostics"]; ok {
			body, _ := json.Marshal(v)
			query += `, diagnostics = diagnostics || $` + fmt.Sprint(i) + `::jsonb`
			args = append(args, body)
			i++
		}
		if v, ok := fields["timing"]; ok {
			body, _ := json.Marshal(v)
			query += `, timing = timing || $` + fmt.Sprint(i) + `::jsonb`
			args = append(args, body)
			i++
		}
		if v, ok := fields["ended_at"]; ok {
			query += `, ended_at = $` + fmt.Sprint(i)
			args = append(args, v)
		}
		query += ` WHERE id = $1`
		_, err := tx.Exec(ctx, query, args...)
		return err
	})
}

func (r *Repository) GetAiSessionByCallID(ctx context.Context, callID uuid.UUID) (uuid.UUID, string, json.RawMessage, json.RawMessage, error) {
	var sessionID uuid.UUID
	var state string
	var diagnostics []byte
	var timing []byte
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT id, state, diagnostics, timing
			FROM ai_sessions WHERE call_id = $1 ORDER BY started_at DESC LIMIT 1
		`, callID).Scan(&sessionID, &state, &diagnostics, &timing)
	})
	return sessionID, state, diagnostics, timing, err
}

func (r *Repository) GetLatestAiSessionForTenant(ctx context.Context, tenantID uuid.UUID) (uuid.UUID, uuid.UUID, string, json.RawMessage, error) {
	var sessionID uuid.UUID
	var callID uuid.UUID
	var state string
	var diagnostics []byte
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT id, call_id, state, diagnostics
			FROM ai_sessions WHERE tenant_id = $1 ORDER BY started_at DESC LIMIT 1
		`, tenantID).Scan(&sessionID, &callID, &state, &diagnostics)
	})
	return sessionID, callID, state, diagnostics, err
}

func (r *Repository) GetProviderCredentialsEncrypted(ctx context.Context, tenantID, connID uuid.UUID) (string, string, error) {
	var enc, providerType string
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT credentials_encrypted, provider_type
			FROM ai_provider_connections
			WHERE id = $1 AND tenant_id = $2 AND is_active = true
		`, connID, tenantID).Scan(&enc, &providerType)
	})
	return enc, providerType, err
}

func (r *Repository) WriteAiUsage(ctx context.Context, tenantID, sessionID, callID, correlationID uuid.UUID, meter, unit, source string, qty float64, idempotencyKey, providerEventID string) (bool, error) {
	inserted := false
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			INSERT INTO ai_usage (
				tenant_id, session_id, call_id, provider, meter_name, quantity, unit,
				measurement_source, idempotency_key, provider_event_id, correlation_id, recorded_at
			) VALUES ($1,$2,$3,'ai',$4,$5,$6,$7,$8,$9,$10,NOW())
			ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
		`, tenantID, sessionID, callID, meter, qty, unit, source, idempotencyKey, providerEventID, correlationID)
		if err != nil {
			return err
		}
		inserted = tag.RowsAffected() > 0
		return nil
	})
	return inserted, err
}

func (r *Repository) EndAiSession(ctx context.Context, sessionID uuid.UUID, state, failureCategory string) error {
	return r.UpdateAiSessionState(ctx, sessionID, state, "completed", map[string]any{
		"ended_at": time.Now().UTC(),
	})
}

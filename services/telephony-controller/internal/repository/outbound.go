package repository

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type OutboundRouteInfo struct {
	TrunkAsteriskID string
	CallerID        string
}

func (r *Repository) LookupExtensionByCallerRef(ctx context.Context, tenantSlug, callerRef string) (*ExtensionInfo, error) {
	callerRef = strings.TrimSpace(callerRef)
	var ext ExtensionInfo
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT e.id, e.tenant_id, t.slug, e.extension_number, e.asterisk_endpoint_id
			FROM extensions e
			JOIN tenants t ON t.id = e.tenant_id
			LEFT JOIN sip_credentials sc ON sc.extension_id = e.id
			WHERE t.slug = $1
			  AND e.status = 'active'
			  AND t.status = 'active'
			  AND (e.extension_number = $2 OR sc.username = $2)
			LIMIT 1
		`, tenantSlug, callerRef).Scan(&ext.ID, &ext.TenantID, &ext.TenantSlug, &ext.ExtensionNumber, &ext.AsteriskEndpointID)
	})
	if err != nil {
		return nil, err
	}
	return &ext, nil
}

func (r *Repository) LookupDefaultOutboundRoute(ctx context.Context, tenantID uuid.UUID) (*OutboundRouteInfo, error) {
	var trunkAsteriskID string
	var policyJSON []byte
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT st.asterisk_trunk_id, or2.caller_id_policy
			FROM outbound_routes or2
			JOIN sip_trunks st ON st.id = or2.trunk_id
			WHERE or2.tenant_id = $1
			  AND or2.is_active = true
			  AND st.is_active = true
			ORDER BY or2.priority ASC, or2.created_at ASC
			LIMIT 1
		`, tenantID).Scan(&trunkAsteriskID, &policyJSON)
	})
	if err != nil {
		return nil, err
	}
	callerID := "+10000000000"
	var policy struct {
		CallerID string `json:"callerId"`
	}
	if json.Unmarshal(policyJSON, &policy) == nil && strings.TrimSpace(policy.CallerID) != "" {
		callerID = strings.TrimSpace(policy.CallerID)
	}
	return &OutboundRouteInfo{
		TrunkAsteriskID: trunkAsteriskID,
		CallerID:        callerID,
	}, nil
}

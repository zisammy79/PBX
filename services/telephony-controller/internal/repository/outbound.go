package repository

import (
	"context"
	"encoding/json"
	"regexp"
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
			SELECT e.id, e.tenant_id, t.slug, e.extension_number, e.display_name, e.asterisk_endpoint_id
			FROM extensions e
			JOIN tenants t ON t.id = e.tenant_id
			LEFT JOIN sip_credentials sc ON sc.extension_id = e.id
			WHERE t.slug = $1
			  AND e.status = 'active'
			  AND t.status = 'active'
			  AND (e.extension_number = $2 OR sc.username = $2)
			LIMIT 1
		`, tenantSlug, callerRef).Scan(&ext.ID, &ext.TenantID, &ext.TenantSlug, &ext.ExtensionNumber, &ext.DisplayName, &ext.AsteriskEndpointID)
	})
	if err != nil {
		return nil, err
	}
	return &ext, nil
}

func (r *Repository) LookupOutboundRouteForDestination(ctx context.Context, tenantID uuid.UUID, destE164 string) (*OutboundRouteInfo, error) {
	destE164 = strings.TrimSpace(destE164)
	rows, err := r.listOutboundRoutes(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	for _, row := range rows {
		if row.Pattern == "" {
			continue
		}
		re, compileErr := regexp.Compile(row.Pattern)
		if compileErr != nil {
			continue
		}
		if re.MatchString(destE164) {
			return &OutboundRouteInfo{
				TrunkAsteriskID: row.TrunkAsteriskID,
				CallerID:        row.CallerID,
			}, nil
		}
	}
	if len(rows) > 0 {
		return &OutboundRouteInfo{
			TrunkAsteriskID: rows[0].TrunkAsteriskID,
			CallerID:        rows[0].CallerID,
		}, nil
	}
	return nil, pgx.ErrNoRows
}

// LookupDefaultOutboundRoute returns the first active outbound route for a tenant.
func (r *Repository) LookupDefaultOutboundRoute(ctx context.Context, tenantID uuid.UUID) (*OutboundRouteInfo, error) {
	rows, err := r.listOutboundRoutes(ctx, tenantID)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, pgx.ErrNoRows
	}
	return &OutboundRouteInfo{
		TrunkAsteriskID: rows[0].TrunkAsteriskID,
		CallerID:        rows[0].CallerID,
	}, nil
}

type outboundRouteRow struct {
	Pattern         string
	TrunkAsteriskID string
	CallerID        string
}

func (r *Repository) listOutboundRoutes(ctx context.Context, tenantID uuid.UUID) ([]outboundRouteRow, error) {
	rows := make([]outboundRouteRow, 0, 8)
	err := r.withBypass(ctx, func(tx pgx.Tx) error {
		dbRows, queryErr := tx.Query(ctx, `
			SELECT or2.pattern, st.asterisk_trunk_id, or2.caller_id_policy, st.config
			FROM outbound_routes or2
			JOIN sip_trunks st ON st.id = or2.trunk_id
			WHERE or2.tenant_id = $1
			  AND or2.is_active = true
			  AND st.is_active = true
			ORDER BY or2.priority ASC, or2.created_at ASC
		`, tenantID)
		if queryErr != nil {
			return queryErr
		}
		defer dbRows.Close()
		for dbRows.Next() {
			var pattern string
			var trunkAsteriskID string
			var policyJSON []byte
			var trunkConfigJSON []byte
			if scanErr := dbRows.Scan(&pattern, &trunkAsteriskID, &policyJSON, &trunkConfigJSON); scanErr != nil {
				return scanErr
			}
			callerID := resolveOutboundCallerID(policyJSON, trunkConfigJSON)
			rows = append(rows, outboundRouteRow{
				Pattern:         strings.TrimSpace(pattern),
				TrunkAsteriskID: strings.TrimSpace(trunkAsteriskID),
				CallerID:        callerID,
			})
		}
		return dbRows.Err()
	})
	if err != nil {
		return nil, err
	}
	return rows, nil
}

func resolveOutboundCallerID(policyJSON, trunkConfigJSON []byte) string {
	var policy struct {
		CallerID string `json:"callerId"`
	}
	if json.Unmarshal(policyJSON, &policy) == nil && strings.TrimSpace(policy.CallerID) != "" {
		return strings.TrimSpace(policy.CallerID)
	}
	var trunkConfig struct {
		AssignedDid     string `json:"assignedDid"`
		AllowedCallerId string `json:"allowedCallerId"`
	}
	if json.Unmarshal(trunkConfigJSON, &trunkConfig) == nil {
		if id := strings.TrimSpace(trunkConfig.AllowedCallerId); id != "" {
			return id
		}
		if id := strings.TrimSpace(trunkConfig.AssignedDid); id != "" {
			return id
		}
	}
	return "+10000000000"
}

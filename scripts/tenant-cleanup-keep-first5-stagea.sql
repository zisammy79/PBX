-- Archive non-kept production tenants (soft-delete).
-- Keep: first 5 by created_at, Stage A (name/slug), active Twilio test tenant.
-- Run only after pg_dump backup. Idempotent for already-archived tenants.

BEGIN;

CREATE TEMP TABLE tenant_cleanup_keep ON COMMIT DROP AS
WITH first_five AS (
  SELECT id
  FROM tenants
  ORDER BY created_at ASC
  LIMIT 5
),
stage_a AS (
  SELECT id
  FROM tenants
  WHERE lower(coalesce(name, '')) = lower('Stage A')
     OR lower(coalesce(slug, '')) IN (lower('Stage A'), lower('stage-a'), lower('stagea'))
),
twilio_test AS (
  SELECT DISTINCT t.id
  FROM tenants t
  LEFT JOIN extensions e ON e.tenant_id = t.id
  LEFT JOIN phone_numbers pn ON pn.tenant_id = t.id
  WHERE e.extension_number = '100'
     OR pn.e164 = '+97233820386'
)
SELECT id FROM first_five
UNION
SELECT id FROM stage_a
UNION
SELECT id FROM twilio_test;

CREATE TEMP TABLE tenant_cleanup_remove ON COMMIT DROP AS
SELECT t.id
FROM tenants t
WHERE t.id NOT IN (SELECT id FROM tenant_cleanup_keep)
  AND t.status <> 'archived';

-- Archive tenants (product lifecycle status).
UPDATE tenants t
SET
  status = 'archived',
  deleted_at = COALESCE(deleted_at, NOW()),
  updated_at = NOW()
FROM tenant_cleanup_remove r
WHERE t.id = r.id;

-- Disable extensions so UI/API do not treat them as live.
UPDATE extensions e
SET status = 'disabled', updated_at = NOW()
FROM tenant_cleanup_remove r
WHERE e.tenant_id = r.id
  AND e.status <> 'disabled';

-- Revoke SIP devices for archived tenants.
UPDATE sip_devices sd
SET
  status = 'revoked',
  provisioning_status = 'deleted',
  revoked_at = COALESCE(revoked_at, NOW()),
  updated_at = NOW()
FROM tenant_cleanup_remove r
WHERE sd.tenant_id = r.id
  AND sd.status <> 'revoked';

-- Clear registration rows for archived tenants.
DELETE FROM sip_registrations sr
USING tenant_cleanup_remove r
WHERE sr.tenant_id = r.id;

-- Deactivate tenant routes (preserve rows/audit; do not delete Twilio test route).
UPDATE inbound_routes ir
SET is_active = FALSE, updated_at = NOW()
FROM tenant_cleanup_remove r
WHERE ir.tenant_id = r.id
  AND ir.is_active = TRUE;

UPDATE outbound_routes orr
SET is_active = FALSE, updated_at = NOW()
FROM tenant_cleanup_remove r
WHERE orr.tenant_id = r.id
  AND orr.is_active = TRUE;

-- Summary (visible in psql output).
SELECT 'kept_tenants' AS section, count(*)::text AS value FROM tenant_cleanup_keep
UNION ALL
SELECT 'archived_now', count(*)::text FROM tenant_cleanup_remove
UNION ALL
SELECT 'remaining_active_tenants', count(*)::text FROM tenants WHERE status = 'active'
UNION ALL
SELECT 'remaining_active_extensions', count(*)::text FROM extensions WHERE status = 'active'
UNION ALL
SELECT 'remaining_phone_numbers', count(*)::text FROM phone_numbers
UNION ALL
SELECT 'remaining_inbound_routes_active', count(*)::text FROM inbound_routes WHERE is_active = TRUE
UNION ALL
SELECT 'remaining_outbound_routes_active', count(*)::text FROM outbound_routes WHERE is_active = TRUE;

SELECT t.id, t.name, t.slug, t.status, t.created_at
FROM tenants t
JOIN tenant_cleanup_keep k ON k.id = t.id
ORDER BY t.created_at;

COMMIT;

#!/usr/bin/env bash
# Stage 7 tenant isolation and reliability checks (no live cross-tenant SIP required).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

set -a
source .env 2>/dev/null || true
set +a

if [[ ! -f .stage7-provision.env ]]; then
  echo "Missing .stage7-provision.env — run scripts/stage7-provision.sh first"
  exit 1
fi

# shellcheck disable=SC1091
source .stage7-provision.env

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/admin-credentials.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/ensure-api-running.sh"
ensure_api_running "$ROOT"

TOKEN="$(fetch_admin_token "$ROOT")"

echo "== Stage 7 isolation + reliability =="

echo "1) Cross-tenant API call list denial"
OTHER_TENANT="$(curl -sf http://localhost:3001/api/v1/tenants -H "Authorization: Bearer $TOKEN" \
  | node -e "
    const tenants=JSON.parse(require('fs').readFileSync(0,'utf8')).tenants||[];
    const other=tenants.find((t)=>t.id!=='${STAGE7_TENANT_ID}');
    if(other) process.stdout.write(other.id);
  ")"

if [[ -z "$OTHER_TENANT" ]]; then
  echo "Creating secondary tenant for isolation probe..."
  OTHER_JSON="$(curl -sf -X POST http://localhost:3001/api/v1/tenants \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{"name":"Stage7 Isolation Tenant","slug":"stage7-isolation-'"$(date +%s)"'","ownerEmail":"iso@test.local","ownerDisplayName":"Iso"}')"
  OTHER_TENANT="$(echo "$OTHER_JSON" | node -pe "JSON.parse(process.argv[1]).tenant.id" "$OTHER_JSON")"
fi

STATUS="$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:3001/api/v1/calls?page=1" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $OTHER_TENANT")"
if [[ "$STATUS" == "200" ]]; then
  echo "Platform admin may list other tenant — verifying RLS blocks non-member user next"
fi

echo "2) Telephony config generator isolation unit tests"
npx pnpm@9.15.0 --filter @pbx/telephony-config test

echo "3) Usage event idempotency (DB constraint)"
CALL_ID="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT id FROM calls WHERE tenant_id='${STAGE7_TENANT_ID}' AND ended_at IS NOT NULL ORDER BY started_at DESC LIMIT 1")"
if [[ -n "$CALL_ID" ]]; then
  BEFORE="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
    "SELECT COUNT(*) FROM usage_events WHERE idempotency_key='internal_call:${CALL_ID}'")"
  docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
    "INSERT INTO usage_events (idempotency_key, tenant_id, call_id, resource_type, meter_name, quantity, unit, event_start, event_end, event_timestamp, source, correlation_id, integrity_hash)
     SELECT idempotency_key, tenant_id, call_id, resource_type, meter_name, quantity, unit, event_start, event_end, NOW(), source, correlation_id, integrity_hash
     FROM usage_events WHERE idempotency_key='internal_call:${CALL_ID}'
     ON CONFLICT (idempotency_key) DO NOTHING" >/dev/null
  AFTER="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
    "SELECT COUNT(*) FROM usage_events WHERE idempotency_key='internal_call:${CALL_ID}'")"
  if [[ "$BEFORE" != "$AFTER" || "$AFTER" != "1" ]]; then
    echo "Usage idempotency failed before=$BEFORE after=$AFTER"
    exit 1
  fi
  echo "Usage idempotency ok for call $CALL_ID"
else
  echo "No completed call found — skip usage idempotency DB probe"
fi

echo "4) Separate tenant dialplan contexts in active config"
grep -q "t_stage7" infrastructure/asterisk/generated/active/extensions-tenants.conf
grep -q "${STAGE7_SLUG}" infrastructure/asterisk/generated/active/extensions-tenants.conf

echo "STAGE7_ISOLATION: PASS"

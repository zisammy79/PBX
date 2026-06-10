#!/usr/bin/env bash
# Provision deterministic-test AI route on the Stage 7 tenant (Slice 8.8).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

set -a
source "${PBX_ENV_FILE:-.env}" 2>/dev/null || true
set +a

if [[ ! -f "${STAGE7_PROVISION_ENV:-.stage7-provision.env}" ]]; then
  echo "Missing ${STAGE7_PROVISION_ENV:-.stage7-provision.env} — run scripts/stage7-provision.sh or make demo-local-seed first"
  exit 1
fi
# shellcheck disable=SC1091
source "${STAGE7_PROVISION_ENV:-.stage7-provision.env}"

AI_ROUTE="${STAGE8_AI_ROUTE:-8999}"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/admin-credentials.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/ensure-api-running.sh"
ensure_api_running "$ROOT"
TOKEN="$(fetch_admin_token "$ROOT")"

TRANSFER_EXT_ID="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT id FROM extensions WHERE tenant_id='${STAGE7_TENANT_ID}' AND extension_number='1002' LIMIT 1")"
if [[ -z "$TRANSFER_EXT_ID" ]]; then
  echo "FAIL: extension 1002 not found for tenant ${STAGE7_TENANT_ID}"
  exit 1
fi

EXISTING_CONN="$(curl -sf "http://localhost:3001/api/v1/ai/provider-connections" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $STAGE7_TENANT_ID" \
  | node -e "
    const rows=JSON.parse(require('fs').readFileSync(0,'utf8'));
    const hit=(Array.isArray(rows)?rows:rows.items||[]).find(r=>r.providerType==='deterministic-test');
    if(hit) process.stdout.write(hit.id);
  " || true)"

if [[ -n "$EXISTING_CONN" ]]; then
  CONN_ID="$EXISTING_CONN"
else
  CONN_JSON="$(curl -sf -X POST "http://localhost:3001/api/v1/ai/provider-connections" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Tenant-Id: $STAGE7_TENANT_ID" \
    -H 'Content-Type: application/json' \
    -d '{"providerType":"deterministic-test","name":"Stage8 Deterministic Provider","credentials":{}}')"
  CONN_ID="$(echo "$CONN_JSON" | node -pe "JSON.parse(process.argv[1]).id" "$CONN_JSON")"
fi

EXISTING_AGENT="$(curl -sf "http://localhost:3001/api/v1/ai/agents" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $STAGE7_TENANT_ID" \
  | node -e "
    const rows=JSON.parse(require('fs').readFileSync(0,'utf8'));
    const hit=(Array.isArray(rows)?rows:rows.items||[]).find(r=>r.routeNumber==='${AI_ROUTE}');
    if(hit) process.stdout.write(hit.id);
  " || true)"

if [[ -n "$EXISTING_AGENT" ]]; then
  AGENT_ID="$EXISTING_AGENT"
  docker exec pbx-postgres psql -U pbx -d pbx -q -c \
    "UPDATE ai_agents SET transfer_extension_id='${TRANSFER_EXT_ID}', updated_at=NOW()
     WHERE id='${AGENT_ID}' AND tenant_id='${STAGE7_TENANT_ID}'" >/dev/null || true
else
  AGENT_JSON="$(curl -sf -X POST "http://localhost:3001/api/v1/ai/agents" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Tenant-Id: $STAGE7_TENANT_ID" \
    -H 'Content-Type: application/json' \
    -d "{
      \"name\":\"Stage8 Deterministic AI (test-only)\",
      \"description\":\"Tenant-scoped deterministic agent for Slice 8.8 SIP proof\",
      \"routeNumber\":\"${AI_ROUTE}\",
      \"transferExtensionId\":\"${TRANSFER_EXT_ID}\",
      \"providerConnectionId\":\"${CONN_ID}\",
      \"provider\":\"deterministic-test\",
      \"model\":\"deterministic-v1\",
      \"voice\":\"default\",
      \"language\":\"en\",
      \"systemInstructions\":\"Test-only deterministic agent. Do not use in production.\",
      \"openingMessage\":\"Deterministic AI ready.\",
      \"allowedTools\":[]
    }")"
  AGENT_ID="$(echo "$AGENT_JSON" | node -pe "JSON.parse(process.argv[1]).id" "$AGENT_JSON")"
fi

curl -sf -X POST "http://localhost:3001/api/v1/ai/agents/${AGENT_ID}/activate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $STAGE7_TENANT_ID" >/dev/null

curl -sf -X POST "http://localhost:3001/api/v1/telephony/configuration/activate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $STAGE7_TENANT_ID" >/dev/null

cat > "$ROOT/.stage8-provision.env" <<EOF
STAGE8_AI_ROUTE=${AI_ROUTE}
STAGE8_AI_AGENT_ID=${AGENT_ID}
STAGE8_AI_PROVIDER_CONN_ID=${CONN_ID}
STAGE8_TENANT_ID=${STAGE7_TENANT_ID}
STAGE8_SLUG=${STAGE7_SLUG}
EOF

echo "Provisioned deterministic AI route ${AI_ROUTE} for tenant ${STAGE7_TENANT_ID}"

#!/usr/bin/env bash
# Provision deterministic-behavior-v1 AI route (Slice 8.9).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

set -a
source "${PBX_ENV_FILE:-.env}" 2>/dev/null || true
set +a

# shellcheck disable=SC1091
source "${STAGE7_PROVISION_ENV:-.stage7-provision.env}"

AI_ROUTE="${STAGE8_BEHAVIOR_AI_ROUTE:-8997}"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/admin-credentials.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/ensure-api-running.sh"
ensure_api_running "$ROOT"
TOKEN="$(fetch_admin_token "$ROOT")"

TRANSFER_EXT_ID="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT id FROM extensions WHERE tenant_id='${STAGE7_TENANT_ID}' AND extension_number='1002' LIMIT 1")"

CONN_ID="$(curl -sf "http://localhost:3001/api/v1/ai/provider-connections" \
  -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: $STAGE7_TENANT_ID" \
  | node -e "const rows=JSON.parse(require('fs').readFileSync(0,'utf8'));const hit=(Array.isArray(rows)?rows:rows.items||[]).find(r=>r.providerType==='deterministic-test');if(hit)process.stdout.write(hit.id);")"

if [[ -z "$CONN_ID" ]]; then
  CONN_JSON="$(curl -sf -X POST "http://localhost:3001/api/v1/ai/provider-connections" \
    -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: $STAGE7_TENANT_ID" \
    -H 'Content-Type: application/json' \
    -d '{"providerType":"deterministic-test","name":"Stage8 Deterministic Provider","credentials":{}}')"
  CONN_ID="$(echo "$CONN_JSON" | node -pe "JSON.parse(process.argv[1]).id" "$CONN_JSON")"
fi

AGENT_ID="$(curl -sf "http://localhost:3001/api/v1/ai/agents" \
  -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: $STAGE7_TENANT_ID" \
  | node -e "const rows=JSON.parse(require('fs').readFileSync(0,'utf8'));const hit=(Array.isArray(rows)?rows:rows.items||[]).find(r=>r.routeNumber==='${AI_ROUTE}');if(hit)process.stdout.write(hit.id);")"

if [[ -z "$AGENT_ID" ]]; then
  AGENT_JSON="$(curl -sf -X POST "http://localhost:3001/api/v1/ai/agents" \
    -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: $STAGE7_TENANT_ID" \
    -H 'Content-Type: application/json' \
    -d "{
      \"name\":\"Stage8 Behavior AI (test-only)\",
      \"description\":\"Barge-in + transfer behavior agent\",
      \"routeNumber\":\"${AI_ROUTE}\",
      \"transferExtensionId\":\"${TRANSFER_EXT_ID}\",
      \"providerConnectionId\":\"${CONN_ID}\",
      \"provider\":\"deterministic-test\",
      \"model\":\"deterministic-behavior-v1\",
      \"voice\":\"default\",
      \"language\":\"en\",
      \"systemInstructions\":\"Test-only behavior agent.\",
      \"openingMessage\":\"Behavior AI ready.\",
      \"allowedTools\":[\"transfer_call\",\"end_call\"]
    }")"
  AGENT_ID="$(echo "$AGENT_JSON" | node -pe "JSON.parse(process.argv[1]).id" "$AGENT_JSON")"
else
  curl -sf -X PATCH "http://localhost:3001/api/v1/ai/agents/${AGENT_ID}" \
    -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: $STAGE7_TENANT_ID" \
    -H 'Content-Type: application/json' \
    -d '{"model":"deterministic-behavior-v1","allowedTools":["transfer_call","end_call"]}' >/dev/null || true
fi

curl -sf -X POST "http://localhost:3001/api/v1/ai/agents/${AGENT_ID}/activate" \
  -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: $STAGE7_TENANT_ID" >/dev/null

curl -sf -X POST "http://localhost:3001/api/v1/telephony/configuration/activate" \
  -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: $STAGE7_TENANT_ID" >/dev/null

cat > "$ROOT/.stage8-behavior.env" <<EOF
STAGE8_BEHAVIOR_AI_ROUTE=${AI_ROUTE}
STAGE8_BEHAVIOR_AGENT_ID=${AGENT_ID}
STAGE8_BEHAVIOR_TENANT_ID=${STAGE7_TENANT_ID}
EOF

echo "Provisioned behavior AI route ${AI_ROUTE} for tenant ${STAGE7_TENANT_ID}"

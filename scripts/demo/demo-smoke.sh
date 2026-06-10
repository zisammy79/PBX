#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/demo/lib/demo-env.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/demo/lib/poll-health.sh"

load_demo_env "$ROOT"

API_URL="${PUBLIC_API_URL:-http://localhost:3001}"
WEB_URL="${PUBLIC_WEB_URL:-http://localhost:3000}"
GW_PORT="${AI_MEDIA_GATEWAY_PORT:-8091}"
PROVISION_ENV="${STAGE7_PROVISION_ENV:-.local/demo-provision.env}"
PROVISION_SECRETS="${STAGE7_PROVISION_SECRETS:-.local/demo-provision.secrets.json}"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

echo "== Local demo smoke test =="

docker exec pbx-redis redis-cli --scan --pattern 'rl:auth:login:*' 2>/dev/null \
  | while read -r key; do
      [[ -n "$key" ]] && docker exec pbx-redis redis-cli DEL "$key" >/dev/null || true
    done || true

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/admin-credentials.sh"
export PBX_ADMIN_TOKEN="$(fetch_admin_token "$ROOT")"

poll_url() {
  local url="$1"
  local attempts="${2:-40}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

echo "1) Core HTTP health"
poll_url "${WEB_URL}/" 40 || fail "web not responding on port 3000"
poll_url "${API_URL}/api/v1/health/ready" 40 || fail "API readiness failed on port 3001"

echo "2) Infrastructure health"
docker exec pbx-postgres pg_isready -U pbx -d pbx >/dev/null || fail "PostgreSQL unhealthy"
docker exec pbx-redis redis-cli ping | grep -q PONG || fail "Redis unhealthy"
curl -sf http://localhost:8222/healthz >/dev/null || fail "NATS unhealthy"
docker exec pbx-asterisk /healthcheck.sh >/dev/null || fail "Asterisk unhealthy"

ARI_USER="${ASTERISK_ARI_USERNAME:-pbx_ari}"
ARI_PASS="${ASTERISK_ARI_PASSWORD:-pbx_ari_dev_password}"
curl -sf -u "${ARI_USER}:${ARI_PASS}" "http://127.0.0.1:18088/asterisk/ari/asterisk/info" >/dev/null \
  || fail "ARI not connected"
curl -sf "http://127.0.0.1:8090/health/ready" >/dev/null || fail "Telephony controller unhealthy"
curl -sf "http://127.0.0.1:${GW_PORT}/health/ready" >/dev/null || fail "AI media gateway unhealthy"

if [[ ! -f .local/demo/worker.pid ]] && ! pgrep -f '@pbx/worker dev' >/dev/null 2>&1; then
  fail "Worker not running"
fi
echo "Worker running"

echo "3) Demo seed artifacts"
[[ -f .local/demo-credentials.json ]] || fail "missing .local/demo-credentials.json"
[[ -f "$PROVISION_ENV" ]] || fail "missing demo provision env"
[[ -f "$PROVISION_SECRETS" ]] || fail "missing demo provision secrets"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/admin-credentials.sh"
TOKEN="${PBX_ADMIN_TOKEN:-$(fetch_admin_token "$ROOT")}"
TENANT_ID="$(node -pe "JSON.parse(require('fs').readFileSync('.local/demo-credentials.json','utf8')).tenantId")"

TENANTS_JSON="$(curl -sf "${API_URL}/api/v1/tenants" -H "Authorization: Bearer $TOKEN")"
echo "$TENANTS_JSON" | node -e "
  const tenants=JSON.parse(require('fs').readFileSync(0,'utf8'));
  const hit=tenants.find(t=>t.slug==='demo-company'||t.id===process.argv[1]);
  if(!hit) process.exit(1);
" "$TENANT_ID" || fail "Demo tenant missing"

EXT_JSON="$(curl -sf "${API_URL}/api/v1/tenants/${TENANT_ID}/extensions" -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: ${TENANT_ID}")"
echo "$EXT_JSON" | node -e "
  const rows=JSON.parse(require('fs').readFileSync(0,'utf8'));
  const nums=new Set(rows.map(r=>r.extensionNumber));
  if(!nums.has('1001')||!nums.has('1002')) process.exit(1);
" || fail "Extensions 1001/1002 missing"

AGENTS_JSON="$(curl -sf "${API_URL}/api/v1/ai/agents" -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: ${TENANT_ID}")"
echo "$AGENTS_JSON" | node -e "
  const rows=JSON.parse(require('fs').readFileSync(0,'utf8'));
  const hit=(Array.isArray(rows)?rows:rows.items||[]).find(a=>a.provider==='deterministic-test'||String(a.routeNumber)==='8999');
  if(!hit) process.exit(1);
" || fail "Deterministic AI agent missing"

USAGE_JSON="$(curl -sf "${API_URL}/api/v1/usage" -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: ${TENANT_ID}")"
echo "$USAGE_JSON" | node -e "
  const rows=JSON.parse(require('fs').readFileSync(0,'utf8'));
  if(!Array.isArray(rows)||rows.length<1) process.exit(1);
" || fail "Usage records missing"

RATED_JSON="$(curl -sf "${API_URL}/api/v1/rated-usage" -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: ${TENANT_ID}")"
echo "$RATED_JSON" | node -e "
  const rows=JSON.parse(require('fs').readFileSync(0,'utf8'));
  if(!Array.isArray(rows)||rows.length<1) process.exit(1);
" || fail "Rated usage missing"

OWNER_TOKEN="$(node -pe "JSON.parse(require('fs').readFileSync('.local/demo-credentials.json','utf8')).ownerToken||''")"
if [[ -z "$OWNER_TOKEN" ]]; then
  fail "Owner token missing from demo credentials"
fi

PREVIEW_JSON="$(curl -sf -X POST "${API_URL}/api/v1/invoices/preview" \
  -H "Authorization: Bearer ${OWNER_TOKEN}" \
  -H "X-Tenant-Id: ${TENANT_ID}" \
  -H 'Content-Type: application/json' \
  -d "{\"periodStart\":\"$(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%SZ)\",\"periodEnd\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"currency\":\"USD\"}")"
echo "$PREVIEW_JSON" | node -e "
  const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
  if(j.metadata?.stripeStatus!=='DISABLED') process.exit(1);
" || fail "Invoice preview failed"

API_KEY="$(node -pe "JSON.parse(require('fs').readFileSync('.local/demo-credentials.json','utf8')).apiKey||''")"
[[ -n "$API_KEY" ]] || fail "API key missing from demo credentials"
curl -sf "${API_URL}/api/v1/calls?page=1&pageSize=1" \
  -H "Authorization: Bearer ${API_KEY}" \
  -H "X-Tenant-Id: ${TENANT_ID}" >/dev/null || fail "API key authentication failed"

echo "4) Webhook fixture"
bash "$ROOT/scripts/demo/webhook-fixture.sh" start
WEBHOOK_ID="$(node -pe "JSON.parse(require('fs').readFileSync('.local/demo-credentials.json','utf8')).webhookEndpointId||''")"
[[ -n "$WEBHOOK_ID" ]] || fail "Webhook endpoint missing from demo credentials"
DELIVERIES_JSON="$(curl -sf "${API_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries" \
  -H "Authorization: Bearer ${OWNER_TOKEN}" \
  -H "X-Tenant-Id: ${TENANT_ID}")"
DELIVERY_ID="$(echo "$DELIVERIES_JSON" | node -pe "const rows=JSON.parse(process.argv[1]); const hit=rows.find(r=>r.status!=='delivered'); process.stdout.write(hit?hit.id:'');" "$DELIVERIES_JSON")"
if [[ -n "$DELIVERY_ID" ]]; then
  curl -sf -X POST "${API_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries/${DELIVERY_ID}/redeliver" \
    -H "Authorization: Bearer ${OWNER_TOKEN}" \
    -H "X-Tenant-Id: ${TENANT_ID}" >/dev/null || true
fi
DELIVERY_STATUS=""
for _ in $(seq 1 30); do
  DELIVERY_STATUS="$(curl -sf "${API_URL}/api/v1/webhooks/${WEBHOOK_ID}/deliveries" \
    -H "Authorization: Bearer ${OWNER_TOKEN}" \
    -H "X-Tenant-Id: ${TENANT_ID}" \
    | node -pe "const rows=JSON.parse(require('fs').readFileSync(0,'utf8')); (rows.find(r=>r.status==='delivered')||{}).status||''")"
  if [[ "$DELIVERY_STATUS" == "delivered" ]]; then
    break
  fi
  sleep 1
done
[[ "$DELIVERY_STATUS" == "delivered" ]] || fail "Webhook delivery not successful"

echo "5) Stage 7 internal SIP test"
docker restart pbx-postgres >/dev/null
for _ in $(seq 1 40); do
  if docker exec pbx-postgres pg_isready -U pbx -d pbx >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done
export STAGE7_PROVISION_ENV="$PROVISION_ENV"
export STAGE7_PROVISION_SECRETS="$PROVISION_SECRETS"
export PBX_ENV_FILE="$ROOT/.env.demo"
export PBX_REPO_ROOT="$ROOT"
export TELEPHONY_ENABLED=true
bash "$ROOT/scripts/stage7-sip-live-test.sh"

echo "6) Stage 8 deterministic media test"
export STAGE7_PROVISION_ENV="$PROVISION_ENV"
export STAGE7_PROVISION_SECRETS="$PROVISION_SECRETS"
export PBX_ENV_FILE="$ROOT/.env.demo"
export PBX_REPO_ROOT="$ROOT"
export TELEPHONY_ENABLED=true
bash "$ROOT/scripts/stage8-sip-ai-deterministic-test.sh"

echo "7) Stage 8 barge-in and transfer test"
bash "$ROOT/scripts/stage8-sip-ai-behavior-test.sh"

echo "DEMO_SMOKE: PASS"

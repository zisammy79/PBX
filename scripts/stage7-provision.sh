#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

set -a
source .env 2>/dev/null || true
set +a

export ALLOW_DEV_SEED=true
export TELEPHONY_ENABLED=true
export ASTERISK_ARI_URL="${ASTERISK_ARI_URL:-http://127.0.0.1:18088/asterisk/ari}"
export ASTERISK_ARI_PASSWORD="${ASTERISK_ARI_PASSWORD:-pbx_ari_dev_password}"
export PBX_REPO_ROOT="$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/admin-credentials.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/ensure-api-running.sh"
ensure_api_running "$ROOT"

ADMIN_PASSWORD="$(resolve_admin_password "$ROOT")"
ADMIN_EMAIL="$(resolve_admin_email)"

echo "Login admin..."
TOKEN="$(fetch_admin_token "$ROOT")"

SLUG="stage7-$(date +%s)"
echo "Create tenant $SLUG..."
TENANT_JSON="$(curl -sf -X POST http://localhost:3001/api/v1/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Stage7 Tenant\",\"slug\":\"$SLUG\",\"ownerEmail\":\"stage7-owner@test.local\",\"ownerDisplayName\":\"Stage7 Owner\"}")"
TENANT_ID="$(echo "$TENANT_JSON" | node -pe "JSON.parse(process.argv[1]).tenant.id" "$TENANT_JSON")"

echo "Create extensions 1001 and 1002..."
EXT1="$(curl -sf -X POST "http://localhost:3001/api/v1/tenants/$TENANT_ID/extensions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $TENANT_ID" \
  -H 'Content-Type: application/json' \
  -d '{"extensionNumber":"1001","displayName":"SIP 1001"}')"
EXT2="$(curl -sf -X POST "http://localhost:3001/api/v1/tenants/$TENANT_ID/extensions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $TENANT_ID" \
  -H 'Content-Type: application/json' \
  -d '{"extensionNumber":"1002","displayName":"SIP 1002"}')"

SIP1_USER="$(echo "$EXT1" | node -pe "JSON.parse(process.argv[1]).sipCredential.username" "$EXT1")"
SIP1_PASS="$(echo "$EXT1" | node -pe "JSON.parse(process.argv[1]).sipCredential.secret" "$EXT1")"
SIP2_USER="$(echo "$EXT2" | node -pe "JSON.parse(process.argv[1]).sipCredential.username" "$EXT2")"
SIP2_PASS="$(echo "$EXT2" | node -pe "JSON.parse(process.argv[1]).sipCredential.secret" "$EXT2")"

echo "Activate telephony configuration..."
curl -sf -X POST "http://localhost:3001/api/v1/telephony/configuration/activate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $TENANT_ID" >/dev/null

echo "STAGE7_TENANT_ID=$TENANT_ID" > "$ROOT/.stage7-provision.env"
echo "STAGE7_SLUG=$SLUG" >> "$ROOT/.stage7-provision.env"
echo "STAGE7_SIP1_USER=$SIP1_USER" >> "$ROOT/.stage7-provision.env"
echo "STAGE7_SIP2_USER=$SIP2_USER" >> "$ROOT/.stage7-provision.env"
# Secrets written to mode 600 file only — not echoed
node -pe "const fs=require('fs'); fs.writeFileSync('$ROOT/.stage7-provision.secrets.json', JSON.stringify({sip1:{u:process.argv[1],p:process.argv[2]},sip2:{u:process.argv[3],p:process.argv[4]}},null,2), {mode:0o600})" "$SIP1_USER" "$SIP1_PASS" "$SIP2_USER" "$SIP2_PASS"

echo "Provisioned tenant $TENANT_ID with extensions 1001/1002 (credentials in .stage7-provision.secrets.json)"

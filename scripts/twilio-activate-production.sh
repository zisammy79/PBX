#!/usr/bin/env bash
# Platform Twilio activation via API (run on production as root). Does not print secrets.
set -euo pipefail
cd /opt/pbx
source .env 2>/dev/null || true

API="http://127.0.0.1:3001/api/v1"
EMAIL="${DEV_ADMIN_EMAIL:-admin@pbx.local}"
PASS="${DEV_ADMIN_PASSWORD:?DEV_ADMIN_PASSWORD required in .env}"
TENANT_ID="${1:-}"
EXT="${2:-100}"

login() {
  curl -sS -c /tmp/pbx-twilio-cookies.txt -X POST "$API/auth/login" \
    -H 'Content-Type: application/json' \
    -d "$(python3 -c "import json,os; print(json.dumps({'email':os.environ['EMAIL'],'password':os.environ['PASS']}))")"
}

token() {
  python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('tokens',{}).get('accessToken',''))"
}

echo "=== validate ==="
login | token | read -r TOK
[[ -n "$TOK" ]] || { echo "login failed"; exit 1; }
curl -sS -X POST "$API/twilio/validate" -H "Authorization: Bearer $TOK" | python3 -m json.tool

echo "=== trunk before sync ==="
curl -sS "$API/twilio/trunk" -H "Authorization: Bearer $TOK" | python3 -m json.tool

echo "=== sync trunk ==="
curl -sS -X POST "$API/twilio/trunk/sync" -H "Authorization: Bearer $TOK" | python3 -m json.tool

if [[ -z "$TENANT_ID" ]]; then
  TENANT_ID="$(docker exec pbx-postgres psql -U pbx -d pbx -tAc "select id from tenants where status='active' order by created_at limit 1")"
fi
TENANT_ID="$(echo "$TENANT_ID" | tr -d '[:space:]')"
echo "=== assign test DID tenant=$TENANT_ID ext=$EXT ==="
curl -sS -X POST "$API/twilio/numbers/assign-existing" \
  -H "Authorization: Bearer $TOK" \
  -H 'Content-Type: application/json' \
  -d "$(python3 -c "import json; print(json.dumps({'tenantId':'$TENANT_ID','inboundDestinationExtensionNumber':'$EXT'}))")" | python3 -m json.tool

rm -f /tmp/pbx-twilio-cookies.txt

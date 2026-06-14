#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

set -a
# shellcheck disable=SC1091
source .env 2>/dev/null || true
set +a

export ALLOW_DEV_SEED=true
export TELEPHONY_ENABLED=true
export PBX_REPO_ROOT="$ROOT"

TENANT_SLUG="${1:-demo-company}"
EXTENSION_NUMBER="${2:-1003}"
ROTATE="${3:-true}"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/admin-credentials.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/ensure-api-running.sh"
ensure_api_running "$ROOT"

TENANT_ID="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT id FROM tenants WHERE slug='${TENANT_SLUG}' LIMIT 1")"
EXT_ID="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT e.id FROM extensions e JOIN tenants t ON t.id=e.tenant_id \
   WHERE t.slug='${TENANT_SLUG}' AND e.extension_number='${EXTENSION_NUMBER}' LIMIT 1")"

[[ -n "$TENANT_ID" && -n "$EXT_ID" ]] || {
  echo "reconcile-extension: extension ${TENANT_SLUG}/${EXTENSION_NUMBER} not found" >&2
  exit 1
}

TOKEN="$(fetch_admin_token "$ROOT")"
BODY='{}'
if [[ "$ROTATE" == "true" ]]; then
  BODY='{"rotateCredential":true}'
fi

RESULT="$(curl -sf -X POST \
  "http://localhost:3001/api/v1/tenants/${TENANT_ID}/extensions/${EXT_ID}/reconcile" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-Tenant-Id: ${TENANT_ID}" \
  -H 'Content-Type: application/json' \
  -d "$BODY")"

STATUS="$(echo "$RESULT" | node -pe "JSON.parse(process.argv[1]).provisioning?.status ?? 'unknown'" "$RESULT")"
echo "reconcile-extension: provisioning_status=${STATUS}"

if [[ "$ROTATE" == "true" ]] && echo "$RESULT" | node -pe "JSON.parse(process.argv[1]).sipCredential?.secret" "$RESULT" >/dev/null 2>&1; then
  USERNAME="$(echo "$RESULT" | node -pe "JSON.parse(process.argv[1]).sipCredential.username" "$RESULT")"
  echo "reconcile-extension: rotated username=${USERNAME}"
  echo "reconcile-extension: password written once to API response (not logged)"
fi

if [[ "$STATUS" != "ready" ]]; then
  echo "reconcile-extension: FAILED" >&2
  echo "$RESULT" >&2
  exit 2
fi

echo "reconcile-extension: OK"

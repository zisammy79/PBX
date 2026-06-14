#!/usr/bin/env bash
# Policy + capture smoke for local call recording (Stage 7 tenant, SIPp 1001 -> 1002).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

set -a
source "${PBX_ENV_FILE:-.env}" 2>/dev/null || true
set +a

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/admin-credentials.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/ensure-api-running.sh"
ensure_api_running "$ROOT"

if [[ ! -f "${STAGE7_PROVISION_ENV:-.stage7-provision.env}" ]]; then
  echo "FAIL: missing .stage7-provision.env"
  exit 1
fi
# shellcheck disable=SC1091
source "${STAGE7_PROVISION_ENV:-.stage7-provision.env}"

TOKEN="$(fetch_admin_token "$ROOT")"
TENANT_ID="$STAGE7_TENANT_ID"
API="${PUBLIC_API_URL:-http://localhost:3001}"
RECORDING_ROOT="${CALL_RECORDING_LOCAL_ROOT:-$ROOT/var/recordings}"

set_org_recording() {
  local enabled="$1"
  curl -sf -X PATCH "${API}/api/v1/tenants/${TENANT_ID}/settings/telephony" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Tenant-Id: $TENANT_ID" \
    -H "Content-Type: application/json" \
    -d "{\"recordCallsByDefault\":${enabled}}" >/dev/null
}

reset_extension_policies() {
  docker exec pbx-postgres psql -U pbx -d pbx -q -c \
    "UPDATE extensions SET recording_policy_mode='inherit', updated_at=NOW()
     WHERE tenant_id='${TENANT_ID}' AND extension_number IN ('1001','1002')" >/dev/null
}

count_recordings_for_latest_call() {
  docker exec pbx-postgres psql -U pbx -d pbx -t -A -c "
    SELECT COUNT(*) FROM call_recordings cr
    INNER JOIN calls c ON c.id = cr.call_id
    WHERE c.tenant_id='${TENANT_ID}'
      AND c.caller_number='1001' AND c.callee_number='1002'
      AND c.started_at > NOW() - INTERVAL '10 minutes'
  " 2>/dev/null | tr -d '[:space:]'
}

latest_recording_status() {
  docker exec pbx-postgres psql -U pbx -d pbx -t -A -c "
    SELECT cr.status FROM call_recordings cr
    INNER JOIN calls c ON c.id = cr.call_id
    WHERE c.tenant_id='${TENANT_ID}'
      AND c.caller_number='1001' AND c.callee_number='1002'
    ORDER BY cr.created_at DESC LIMIT 1
  " 2>/dev/null | tr -d '[:space:]'
}

latest_call_id() {
  docker exec pbx-postgres psql -U pbx -d pbx -t -A -c "
    SELECT id FROM calls
    WHERE tenant_id='${TENANT_ID}' AND caller_number='1001' AND callee_number='1002'
      AND status='completed' AND started_at > NOW() - INTERVAL '10 minutes'
    ORDER BY started_at DESC LIMIT 1
  " 2>/dev/null | tr -d '[:space:]'
}

run_sip_call() {
  bash "$ROOT/scripts/stage7-sip-live-test.sh"
}

echo "== Call recording validation =="
echo "Tenant: $TENANT_ID"
echo "Recording root: $RECORDING_ROOT"

echo "1) Test A — org off, extensions inherit (expect no recording)"
set_org_recording false
reset_extension_policies
BEFORE_A="$(count_recordings_for_latest_call || echo 0)"
run_sip_call
sleep 2
AFTER_A="$(count_recordings_for_latest_call || echo 0)"
if [[ "$AFTER_A" != "$BEFORE_A" ]]; then
  echo "FAIL Test A: recording row appeared when policy off (before=$BEFORE_A after=$AFTER_A)"
  exit 1
fi
echo "PASS Test A: no new recording row"

echo "2) Test B — org on, extensions inherit (expect one ready recording)"
set_org_recording true
run_sip_call
sleep 3
STATUS_B="$(latest_recording_status || true)"
CALL_ID="$(latest_call_id || true)"
if [[ -z "$CALL_ID" ]]; then
  echo "FAIL Test B: no completed call found"
  exit 1
fi
REC_COUNT="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT COUNT(*) FROM call_recordings WHERE call_id='${CALL_ID}'" 2>/dev/null | tr -d '[:space:]')"
if [[ "$REC_COUNT" != "1" ]]; then
  echo "FAIL Test B: expected 1 recording row for call $CALL_ID, got $REC_COUNT"
  exit 1
fi
if [[ "$STATUS_B" != "available" ]]; then
  echo "FAIL Test B: expected status available, got $STATUS_B"
  docker logs pbx-telephony-controller 2>&1 | tail -30 || true
  exit 1
fi
STORAGE_KEY="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT storage_key FROM call_recordings WHERE call_id='${CALL_ID}' LIMIT 1" 2>/dev/null | tr -d '[:space:]')"
FILE_PATH="${RECORDING_ROOT}/${STORAGE_KEY}"
if [[ ! -f "$FILE_PATH" ]]; then
  echo "FAIL Test B: recording file missing at expected storage key path"
  ls -la "$RECORDING_ROOT" 2>/dev/null | head -20 || true
  exit 1
fi
FILE_SIZE="$(stat -c%s "$FILE_PATH" 2>/dev/null || stat -f%z "$FILE_PATH")"
if [[ "$FILE_SIZE" -lt 44 ]]; then
  echo "FAIL Test B: recording file too small ($FILE_SIZE bytes)"
  exit 1
fi
echo "PASS Test B: call_id=${CALL_ID:0:8}… status=$STATUS_B size=${FILE_SIZE}B"

echo "3) Playback API (authenticated Range probe)"
REC_ID="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT id FROM call_recordings WHERE call_id='${CALL_ID}' LIMIT 1" 2>/dev/null | tr -d '[:space:]')"
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $TENANT_ID" \
  -H "Range: bytes=0-43" \
  "${API}/api/v1/tenants/${TENANT_ID}/recordings/${REC_ID}/content")"
if [[ "$HTTP_CODE" != "206" && "$HTTP_CODE" != "200" ]]; then
  echo "FAIL playback: expected 206/200, got $HTTP_CODE"
  exit 1
fi
echo "PASS playback: HTTP $HTTP_CODE"

echo "4) Restart persistence (telephony-controller)"
docker restart pbx-telephony-controller >/dev/null
sleep 5
if [[ ! -f "$FILE_PATH" ]]; then
  echo "FAIL persistence: file missing after controller restart"
  exit 1
fi
HTTP_AFTER="$(curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $TENANT_ID" \
  "${API}/api/v1/tenants/${TENANT_ID}/recordings/${REC_ID}/content")"
if [[ "$HTTP_AFTER" != "200" ]]; then
  echo "FAIL persistence playback after restart: HTTP $HTTP_AFTER"
  exit 1
fi
echo "PASS persistence after controller restart"

echo "CALL_RECORDING_VALIDATE: PASS call_id=${CALL_ID} recording_id=${REC_ID} policy=org_on_inherit"

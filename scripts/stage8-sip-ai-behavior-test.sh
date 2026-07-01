#!/usr/bin/env bash
# Stage 8.9 — deterministic barge-in + human transfer proof.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

set -a
source "${PBX_ENV_FILE:-.env}" 2>/dev/null || true
set +a

SIP_DOCKER_NETWORK="${SIP_DOCKER_NETWORK:-pbx-internal}"
SIP_DOCKER_TARGET="${SIP_DOCKER_TARGET:-asterisk:5060}"
SIP_HOST="${SIP_HOST:-127.0.0.1}"
SIP_PORT="${SIP_PORT:-${SIP_UDP_PUBLISH:-5060}}"
SIP_IMAGE="${SIP_IMAGE:-pbertera/sipp}"
SIPP_DIR="$ROOT/scripts/sipp"
GW_PORT="${AI_MEDIA_GATEWAY_PORT:-8091}"

cleanup() {
  docker rm -f pbx-sipp-behavior-reg pbx-sipp-behavior-human-uas pbx-sipp-behavior-uac 2>/dev/null || true
  fuser -k 5094/udp 5095/udp 5072/udp 6050/udp 6051/udp 6000/udp 2>/dev/null || true
}
trap cleanup EXIT

echo "== Stage 8.9 deterministic behavior (barge-in + transfer) =="

# shellcheck disable=SC1091
source "${STAGE7_PROVISION_ENV:-.stage7-provision.env}"
bash scripts/stage8-provision-behavior-route.sh
# shellcheck disable=SC1091
source .stage8-behavior.env
AI_ROUTE="${STAGE8_BEHAVIOR_AI_ROUTE:-8997}"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/sip-credentials.sh"
SIP1_PASS="$(resolve_sip_password "$STAGE7_SIP1_USER")"
SIP2_PASS="$(resolve_sip_password "$STAGE7_SIP2_USER")"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/admin-credentials.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/ensure-api-running.sh"
ensure_api_running "$ROOT"
TOKEN="$(fetch_admin_token "$ROOT")"

echo "1) Readiness"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf http://127.0.0.1:8090/health/ready >/dev/null \
    && curl -sf "http://127.0.0.1:${GW_PORT}/health/ready" >/dev/null; then
    break
  fi
  sleep 1
done

curl -sf -X POST "http://localhost:3001/api/v1/telephony/configuration/activate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $STAGE7_TENANT_ID" >/dev/null

docker exec pbx-postgres psql -U pbx -d pbx -q -c \
  "UPDATE calls SET status='failed', ended_at=NOW(), hangup_cause='stale_test_cleanup', updated_at=NOW()
   WHERE tenant_id='${STAGE7_TENANT_ID}' AND ended_at IS NULL AND started_at < NOW() - INTERVAL '2 minutes'" >/dev/null || true

echo "2) Register human 1002 then caller 1001"
docker rm -f pbx-sipp-behavior-reg pbx-sipp-behavior-human-uas pbx-sipp-behavior-uac 2>/dev/null || true
fuser -k 5094/udp 5095/udp 5072/udp 6050/udp 6051/udp 6000/udp 2>/dev/null || true

docker restart pbx-asterisk >/dev/null
for _ in $(seq 1 45); do
  if docker exec pbx-asterisk /healthcheck.sh >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -sf http://127.0.0.1:8090/health/ready >/dev/null || sleep 3

docker exec pbx-asterisk asterisk -rx "database deltree registrar/contact/${STAGE7_SIP2_USER}" >/dev/null 2>&1 || true

docker run -d --name pbx-sipp-behavior-human-uas --network "$SIP_DOCKER_NETWORK" \
  -v "$SIPP_DIR:/scenarios:ro" --entrypoint /bin/sh "$SIP_IMAGE" \
  -c "sipp -sf /scenarios/register-exit.xml -s '$STAGE7_SIP2_USER' -p 5072 -mp 6000 \
    -au '$STAGE7_SIP2_USER' -ap '$SIP2_PASS' -r 1 -m 1 '$SIP_DOCKER_TARGET' && \
    exec sipp -sf /scenarios/uas-answer.xml -s '$STAGE7_SIP2_USER' -p 5072 -mp 6000 \
    -r 1 -m 1 -d 120000 '$SIP_DOCKER_TARGET'"

sleep 3

HUMAN_SIPP_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' pbx-sipp-behavior-human-uas)"
CALLEE_REG=0
AOR_OUT=""
for _ in $(seq 1 45); do
  AOR_OUT="$(docker exec pbx-asterisk asterisk -rx "pjsip show aor ${STAGE7_SIP2_USER}" 2>/dev/null || true)"
  if echo "$AOR_OUT" | grep -q "@${HUMAN_SIPP_IP}:5072"; then
    CALLEE_REG=1
    break
  fi
  sleep 1
done
if [[ "$CALLEE_REG" != "1" ]]; then
  echo "FAIL: human extension not registered on ${HUMAN_SIPP_IP}:5072"
  docker logs pbx-sipp-behavior-human-uas 2>&1 | tail -15 || true
  exit 1
fi
HUMAN_CONTACT_COUNT="$(echo "$AOR_OUT" | grep -c "@${HUMAN_SIPP_IP}:5072" || true)"
if [[ "$HUMAN_CONTACT_COUNT" != "1" ]]; then
  echo "FAIL: expected exactly one human contact, found ${HUMAN_CONTACT_COUNT}"
  docker exec pbx-asterisk asterisk -rx "pjsip show aor ${STAGE7_SIP2_USER}" || true
  exit 1
fi
if echo "$AOR_OUT" | grep -q "172.25.0.1:"; then
  echo "FAIL: stale host-network human contact present"
  exit 1
fi
echo "Human contact verified: ${HUMAN_SIPP_IP}:5072 count=1"
sleep 2

docker run -d --name pbx-sipp-behavior-reg --network "$SIP_DOCKER_NETWORK" \
  -v "$SIPP_DIR:/scenarios:ro" "$SIP_IMAGE" \
  -sf /scenarios/register.xml -s "$STAGE7_SIP1_USER" -p 5094 -mp 6050 \
  -au "$STAGE7_SIP1_USER" -ap "$SIP1_PASS" -r 1 -m 1 -d 120000 "$SIP_DOCKER_TARGET" >/dev/null

REGISTERED=0
for _ in $(seq 1 45); do
  CONTACTS="$(docker exec pbx-asterisk asterisk -rx "pjsip show contacts" 2>/dev/null || true)"
  if echo "$CONTACTS" | grep -q "$STAGE7_SIP1_USER"; then
    REGISTERED=1
    break
  fi
  sleep 1
done
if [[ "$REGISTERED" != "1" ]]; then
  echo "FAIL: caller not registered (human=${CALLEE_REG})"
  exit 1
fi

INF_FILE="$(mktemp)"
printf 'SEQUENTIAL\n%s;%s\n' "$STAGE7_SIP1_USER" "$AI_ROUTE" >"$INF_FILE"

echo "3) Place AI behavior call"
TEST_START_ISO="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
docker run -d --name pbx-sipp-behavior-uac --network "$SIP_DOCKER_NETWORK" \
  -v "$SIPP_DIR:/scenarios:ro" -v "$INF_FILE:/tmp/uac.csv:ro" "$SIP_IMAGE" \
  -sf /scenarios/call-ai-behavior.xml -p 5095 -mp 6051 -inf /tmp/uac.csv \
  -au "$STAGE7_SIP1_USER" -ap "$SIP1_PASS" -d 90000 -m 1 -rtp_echo \
  "$SIP_DOCKER_TARGET" >/dev/null

AI_SESSION_ID=""
CALL_ID=""
BARGE_IN=0
TRANSFERRED=0
for _ in $(seq 1 90); do
  ROW="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
    "SELECT id,call_id,state,diagnostics::text FROM ai_sessions
     WHERE tenant_id='${STAGE7_TENANT_ID}' AND started_at >= '${TEST_START_ISO}'::timestamptz
     ORDER BY started_at DESC LIMIT 1")"
  if [[ -z "$ROW" ]]; then
    sleep 1
    continue
  fi
  AI_SESSION_ID="${ROW%%|*}"
  REST="${ROW#*|}"
  CALL_ID="${REST%%|*}"
  REST2="${REST#*|}"
  STATE="${REST2%%|*}"
  DIAG="${REST2#*|}"
  if [[ -n "$DIAG" && "$DIAG" != "null" ]]; then
    INT_AT="$(echo "$DIAG" | node -pe "const d=JSON.parse(process.argv[1]||'{}');(d.behavior&&d.behavior.interruptionDetectedAt)||d.interruptionDetectedAt||''" "$DIAG")"
    DISCARDED="$(echo "$DIAG" | node -pe "const d=JSON.parse(process.argv[1]||'{}');(d.behavior&&d.behavior.queuedFramesDiscarded)||0" "$DIAG")"
    if [[ -n "$INT_AT" && "${DISCARDED:-0}" -gt 0 ]]; then
      BARGE_IN=1
    fi
  fi
  if [[ "$STATE" == "TRANSFERRED" || "$STATE" == "COMPLETED" ]]; then
    if docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
      "SELECT 1 FROM call_legs WHERE call_id='${CALL_ID}' AND leg_type='human' LIMIT 1" | grep -q 1; then
      TRANSFERRED=1
      break
    fi
  fi
  sleep 1
done

if [[ -z "$AI_SESSION_ID" ]]; then
  echo "FAIL: no AI session"
  exit 1
fi
if [[ "$BARGE_IN" != "1" ]]; then
  LIVE_STATS="$(curl -sf "http://127.0.0.1:${GW_PORT}/internal/v1/sessions/${AI_SESSION_ID}/stats" || echo '{}')"
  INT_LIVE="$(echo "$LIVE_STATS" | node -pe "JSON.parse(process.argv[1]||'{}').behavior?.interruptionDetectedAt||''" "$LIVE_STATS")"
  if [[ -n "$INT_LIVE" ]]; then BARGE_IN=1; fi
fi
if [[ "$BARGE_IN" != "1" ]]; then
  echo "FAIL: barge-in not proven"
  exit 1
fi
if [[ "$TRANSFERRED" != "1" ]]; then
  echo "FAIL: human transfer not proven (state=${STATE})"
  exit 1
fi

USAGE_COUNT="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT COUNT(*) FROM ai_usage WHERE session_id='${AI_SESSION_ID}'")"
DUP_USAGE="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT COUNT(*) FROM (SELECT idempotency_key FROM ai_usage WHERE session_id='${AI_SESSION_ID}' AND idempotency_key IS NOT NULL GROUP BY idempotency_key HAVING COUNT(*)>1) x")"
if [[ "$USAGE_COUNT" -lt 4 || "$DUP_USAGE" != "0" ]]; then
  echo "FAIL: usage metering missing or duplicated (count=${USAGE_COUNT} dup=${DUP_USAGE})"
  exit 1
fi

echo "4) Stage 7 regression"
bash scripts/stage7-sip-live-test.sh

echo "5) Tenant isolation regression"
bash scripts/stage7-isolation-test.sh

echo "STAGE8_DETERMINISTIC_BEHAVIOR: PASS session=${AI_SESSION_ID} call=${CALL_ID} usage=${USAGE_COUNT}"

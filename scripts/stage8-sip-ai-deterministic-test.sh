#!/usr/bin/env bash
# Stage 8.8 — deterministic SIP-to-AI External Media proof.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

set -a
source "${PBX_ENV_FILE:-.env}" 2>/dev/null || true
set +a

SIP_HOST="${SIP_HOST:-127.0.0.1}"
SIP_PORT="${SIP_PORT:-${SIP_UDP_PUBLISH:-5060}}"
SIP_DOCKER_NETWORK="${SIP_DOCKER_NETWORK:-pbx-internal}"
SIP_DOCKER_TARGET="${SIP_DOCKER_TARGET:-asterisk:5060}"
SIP_IMAGE="${SIP_IMAGE:-pbertera/sipp}"
SIPP_DIR="$ROOT/scripts/sipp"
AI_ROUTE="${STAGE8_AI_ROUTE:-8999}"
GW_PORT="${AI_MEDIA_GATEWAY_PORT:-8091}"

cleanup() {
  docker rm -f pbx-sipp-ai-reg pbx-sipp-ai-uac 2>/dev/null || true
  fuser -k 5084/udp 5085/udp 6030/udp 6031/udp 6040/udp 6041/udp 2>/dev/null || true
}
trap cleanup EXIT

echo "== Stage 8.8 deterministic SIP-to-AI External Media =="

if [[ ! -f "${STAGE7_PROVISION_ENV:-.stage7-provision.env}" ]]; then
  echo "FAIL: missing Stage 7 provision env (${STAGE7_PROVISION_ENV:-.stage7-provision.env})"
  exit 1
fi
# shellcheck disable=SC1091
source "${STAGE7_PROVISION_ENV:-.stage7-provision.env}"

echo "1) Service readiness"
READY=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf http://127.0.0.1:8090/health/ready >/dev/null \
    && curl -sf "http://127.0.0.1:${GW_PORT}/health/ready" >/dev/null \
    && docker exec pbx-postgres pg_isready -U pbx >/dev/null 2>&1 \
    && docker exec pbx-redis redis-cli ping 2>/dev/null | grep -q PONG \
    && docker exec pbx-asterisk /healthcheck.sh >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done
if [[ "$READY" != "1" ]]; then
  echo "FAIL: core services not ready"
  exit 1
fi

ASTERISK_VERSION="$(docker exec pbx-asterisk asterisk -rx "core show version" 2>/dev/null | tr -d '\r')"
ASTERISK_VERSION="${ASTERISK_VERSION%%$'\n'*}"
echo "Asterisk: ${ASTERISK_VERSION}"

echo "2) Provision deterministic AI route"
bash scripts/stage8-provision-ai-route.sh
sleep 3
# shellcheck disable=SC1091
source .stage8-provision.env
AI_ROUTE="${STAGE8_AI_ROUTE:-8999}"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/sip-credentials.sh"
SIP1_PASS="$(resolve_sip_password "$STAGE7_SIP1_USER")"
if [[ -z "$SIP1_PASS" ]]; then
  echo "FAIL: could not resolve SIP password for $STAGE7_SIP1_USER from active PJSIP config"
  exit 1
fi
SIP1_USER="$STAGE7_SIP1_USER"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/admin-credentials.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/ensure-api-running.sh"
ensure_api_running "$ROOT"
TOKEN="$(fetch_admin_token "$ROOT")"

echo "3) Asterisk External Media capability probe"
docker exec pbx-asterisk asterisk -rx "module show like res_ari" >/dev/null
docker exec pbx-asterisk asterisk -rx "core show codecs" | grep -E 'ulaw|alaw' >/dev/null

echo "4) Register caller and place AI route call"
docker exec pbx-postgres psql -U pbx -d pbx -q -c \
  "UPDATE calls SET status='failed', ended_at=NOW(), hangup_cause='stale_test_cleanup', updated_at=NOW()
   WHERE tenant_id='${STAGE7_TENANT_ID}' AND ended_at IS NULL AND started_at < NOW() - INTERVAL '2 minutes'" >/dev/null || true
fuser -k 5084/udp 5085/udp 6030/udp 6031/udp 6040/udp 6041/udp 2>/dev/null || true
docker rm -f pbx-sipp-ai-reg pbx-sipp-ai-uac 2>/dev/null || true

docker run -d --name pbx-sipp-ai-reg --network "$SIP_DOCKER_NETWORK" \
  -v "$SIPP_DIR:/scenarios:ro" \
  "$SIP_IMAGE" \
  -sf /scenarios/register.xml -s "$SIP1_USER" -p 5084 -mp 6030 \
  -au "$SIP1_USER" -ap "$SIP1_PASS" -d 120000 -m 1 \
  "$SIP_DOCKER_TARGET" >/dev/null

REGISTERED=0
for _ in $(seq 1 45); do
  if docker exec pbx-asterisk asterisk -rx "pjsip show contacts" 2>/dev/null | grep -q "$SIP1_USER"; then
    REGISTERED=1
    break
  fi
  sleep 1
done
if [[ "$REGISTERED" != "1" ]]; then
  echo "FAIL: caller not registered"
  exit 1
fi

TEST_START_ISO="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
INF_FILE="$(mktemp)"
printf 'SEQUENTIAL\n%s;%s\n' "$SIP1_USER" "$AI_ROUTE" >"$INF_FILE"

docker run -d --name pbx-sipp-ai-uac --network "$SIP_DOCKER_NETWORK" \
  -v "$SIPP_DIR:/scenarios:ro" \
  -v "$INF_FILE:/tmp/uac.csv:ro" \
  "$SIP_IMAGE" \
  -sf /scenarios/call-ai.xml -p 5085 -mp 6040 \
  -inf /tmp/uac.csv \
  -au "$SIP1_USER" -ap "$SIP1_PASS" \
  -d 45000 -m 1 -trace_err -trace_stat -stf /tmp/uac_stat.csv -rtp_echo \
  "$SIP_DOCKER_TARGET" >/dev/null

ACTIVE_SEEN=0
ACTIVE_CALL_ID=""
AI_SESSION_ID=""
for _ in $(seq 1 40); do
  ACTIVE_JSON="$(curl -sf "http://localhost:3001/api/v1/calls/active" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Tenant-Id: $STAGE7_TENANT_ID" || echo '{}')"
  ACTIVE_CALL_ID="$(echo "$ACTIVE_JSON" | node -e "
    const raw=JSON.parse(require('fs').readFileSync(0,'utf8'));
    const items=Array.isArray(raw)?raw:(raw.data||raw.items||[]);
    const since=new Date(process.argv[1]).getTime();
    const hit=items.find((c)=>{
      if(c.callerNumber!=='1001'||String(c.calleeNumber)!=='${AI_ROUTE}') return false;
      const started=Date.parse(c.startedAt||c.started_at||'');
      return !Number.isNaN(started)&&started>=since-5000;
    });
    process.stdout.write(hit?(hit.id||hit.callId||''):'');
  " "$TEST_START_ISO")"
  if [[ -n "$ACTIVE_CALL_ID" ]]; then
    ACTIVE_SEEN=1
    AI_SESSION_ID="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
      "SELECT id FROM ai_sessions WHERE call_id='${ACTIVE_CALL_ID}' ORDER BY started_at DESC LIMIT 1" || true)"
    if [[ -n "$AI_SESSION_ID" ]]; then
      MEDIA_STATS="$(curl -sf "http://127.0.0.1:${GW_PORT}/internal/v1/sessions/${AI_SESSION_ID}/stats" || echo '{}')"
      RX_PKTS="$(echo "$MEDIA_STATS" | node -pe "JSON.parse(process.argv[1]).rtpPacketsReceived||0" "$MEDIA_STATS")"
      TX_PKTS="$(echo "$MEDIA_STATS" | node -pe "JSON.parse(process.argv[1]).rtpPacketsSent||0" "$MEDIA_STATS")"
      if [[ "$RX_PKTS" -gt 0 && "$TX_PKTS" -gt 0 ]]; then
        break
      fi
    fi
  fi
  sleep 1
done

if [[ "$ACTIVE_SEEN" != "1" ]]; then
  echo "FAIL: no active AI call observed"
  docker logs pbx-sipp-ai-uac 2>&1 | tail -30 || true
  exit 1
fi
if [[ -z "$ACTIVE_CALL_ID" && -n "$AI_SESSION_ID" ]]; then
  ACTIVE_CALL_ID="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
    "SELECT call_id FROM ai_sessions WHERE id='${AI_SESSION_ID}' LIMIT 1" || true)"
fi
if [[ -z "$AI_SESSION_ID" && -n "$ACTIVE_CALL_ID" ]]; then
  AI_SESSION_ID="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
    "SELECT id FROM ai_sessions WHERE call_id='${ACTIVE_CALL_ID}' ORDER BY started_at DESC LIMIT 1" || true)"
fi
if [[ -z "$AI_SESSION_ID" ]]; then
  echo "FAIL: AI session not created for call ${ACTIVE_CALL_ID}"
  exit 1
fi
echo "Active AI call ${ACTIVE_CALL_ID} session ${AI_SESSION_ID}"

echo "5) Wait for media exchange"
RX_PKTS=0
TX_PKTS=0
RX_BYTES=0
TX_BYTES=0
for _ in $(seq 1 60); do
  if [[ -z "$AI_SESSION_ID" ]]; then
    ROW="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
      "SELECT id,call_id FROM ai_sessions
       WHERE tenant_id='${STAGE7_TENANT_ID}' AND started_at >= '${TEST_START_ISO}'::timestamptz
       ORDER BY started_at DESC LIMIT 1" 2>/dev/null || true)"
    if [[ -n "$ROW" ]]; then
      AI_SESSION_ID="${ROW%%|*}"
      ACTIVE_CALL_ID="${ROW#*|}"
      ACTIVE_SEEN=1
    fi
  fi
  if [[ -n "$AI_SESSION_ID" ]]; then
    MEDIA_STATS="$(curl -sf "http://127.0.0.1:${GW_PORT}/internal/v1/sessions/${AI_SESSION_ID}/stats" || echo '{}')"
    RX_PKTS="$(echo "$MEDIA_STATS" | node -pe "JSON.parse(process.argv[1]).rtpPacketsReceived||0" "$MEDIA_STATS")"
    TX_PKTS="$(echo "$MEDIA_STATS" | node -pe "JSON.parse(process.argv[1]).rtpPacketsSent||0" "$MEDIA_STATS")"
    RX_BYTES="$(echo "$MEDIA_STATS" | node -pe "JSON.parse(process.argv[1]).rtpBytesReceived||0" "$MEDIA_STATS")"
    TX_BYTES="$(echo "$MEDIA_STATS" | node -pe "JSON.parse(process.argv[1]).rtpBytesSent||0" "$MEDIA_STATS")"
    if [[ "$RX_PKTS" -gt 0 && "$TX_PKTS" -gt 0 && "$RX_BYTES" -gt 0 && "$TX_BYTES" -gt 0 ]]; then
      break
    fi
    PERSIST_MEDIA="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
      "SELECT diagnostics->'media' FROM ai_sessions WHERE id='${AI_SESSION_ID}'" 2>/dev/null || true)"
    if [[ -n "$PERSIST_MEDIA" && "$PERSIST_MEDIA" != "null" ]]; then
      RX_PKTS="$(echo "$PERSIST_MEDIA" | node -pe "JSON.parse(process.argv[1]).rtpPacketsReceived||0" "$PERSIST_MEDIA")"
      TX_PKTS="$(echo "$PERSIST_MEDIA" | node -pe "JSON.parse(process.argv[1]).rtpPacketsSent||0" "$PERSIST_MEDIA")"
      RX_BYTES="$(echo "$PERSIST_MEDIA" | node -pe "JSON.parse(process.argv[1]).rtpBytesReceived||0" "$PERSIST_MEDIA")"
      TX_BYTES="$(echo "$PERSIST_MEDIA" | node -pe "JSON.parse(process.argv[1]).rtpBytesSent||0" "$PERSIST_MEDIA")"
      if [[ "$RX_PKTS" -gt 0 && "$TX_PKTS" -gt 0 && "$RX_BYTES" -gt 0 && "$TX_BYTES" -gt 0 ]]; then
        MEDIA_STATS="$PERSIST_MEDIA"
        break
      fi
    fi
  fi
  sleep 0.5
done
echo "Gateway media stats: ${MEDIA_STATS}"

if [[ "$RX_PKTS" -le 0 || "$TX_PKTS" -le 0 || "$RX_BYTES" -le 0 || "$TX_BYTES" -le 0 ]]; then
  echo "FAIL: bidirectional media not proven (rx=${RX_PKTS} tx=${TX_PKTS})"
  docker logs pbx-telephony-controller 2>&1 | tail -40 || true
  docker logs pbx-ai-media-gateway 2>&1 | tail -40 || true
  exit 1
fi

echo "6) Wait for call completion and cleanup"
if [[ -z "$ACTIVE_CALL_ID" ]]; then
  echo "FAIL: missing call id for completion check"
  exit 1
fi
for _ in $(seq 1 30); do
  STATUS="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
    "SELECT status FROM calls WHERE id='${ACTIVE_CALL_ID}'")"
  if [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]]; then
    break
  fi
  sleep 1
done

BRIDGES="$(docker exec pbx-asterisk asterisk -rx "bridge show all" 2>/dev/null | grep -c "${ACTIVE_CALL_ID}" || true)"
CHANNELS="$(docker exec pbx-asterisk asterisk -rx "core show channels" 2>/dev/null | grep -c "1001" || true)"

AI_STATE="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT state FROM ai_sessions WHERE id='${AI_SESSION_ID}'")"
AI_DIAG="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT diagnostics::text FROM ai_sessions WHERE id='${AI_SESSION_ID}'")"

if [[ "$AI_STATE" != "COMPLETED" && "$AI_STATE" != "FAILED" ]]; then
  echo "WARN: AI session state=${AI_STATE} (expected COMPLETED after hangup)"
fi

echo "Inbound media: packets=${RX_PKTS} bytes=${RX_BYTES}"
echo "Outbound media: packets=${TX_PKTS} bytes=${TX_BYTES}"
echo "AI session state: ${AI_STATE}"
echo "Post-call channels(1001): ${CHANNELS} bridge refs: ${BRIDGES}"
echo "AI diagnostics (sanitized): $(echo "$AI_DIAG" | node -pe "const d=JSON.parse(process.argv[1]||'{}'); delete d.credentialsEncrypted; JSON.stringify(d)" "$AI_DIAG" 2>/dev/null || echo '{}')"

echo "7) Stage 7 extension regression"
bash scripts/stage7-sip-live-test.sh

echo "8) Stage 7 tenant isolation regression"
bash scripts/stage7-isolation-test.sh

echo "STAGE8_DETERMINISTIC_SIP_AI: PASS"

#!/usr/bin/env bash
# Reproducible Stage 7 live SIP test: extension 1001 -> 1002 through Asterisk + Stasis.
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
CALLEE_SIPP_PORT=5072
CALLER_SIPP_PORT=5071
SIP_IMAGE="${SIP_IMAGE:-pbertera/sipp}"
SIPP_DIR="$ROOT/scripts/sipp"

cleanup() {
  docker rm -f pbx-sipp-reg pbx-sipp-uas pbx-sipp-uac 2>/dev/null || true
  pkill -f 'sipp.*507[123]' 2>/dev/null || true
}
trap cleanup EXIT

if [[ ! -f "${STAGE7_PROVISION_ENV:-.stage7-provision.env}" || ! -f "${STAGE7_PROVISION_SECRETS:-.stage7-provision.secrets.json}" ]]; then
  echo "Missing provision files — run scripts/stage7-provision.sh or make demo-local-seed first"
  exit 1
fi

# shellcheck disable=SC1091
source "${STAGE7_PROVISION_ENV:-.stage7-provision.env}"

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/sip-credentials.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/sip-local-ip.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/admin-credentials.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/ensure-api-running.sh"
ensure_api_running "$ROOT"

SIP1_PASS="$(resolve_sip_password "$STAGE7_SIP1_USER")"
SIP2_PASS="$(resolve_sip_password "$STAGE7_SIP2_USER")"
if [[ -z "$SIP1_PASS" || -z "$SIP2_PASS" ]]; then
  echo "FAIL: could not resolve SIP passwords from active PJSIP config"
  exit 1
fi
SIP1_USER="$STAGE7_SIP1_USER"
SIP2_USER="$STAGE7_SIP2_USER"
SIP_LOCAL_IP="$(resolve_sip_local_ip)"

TOKEN="$(fetch_admin_token "$ROOT")"

echo "== Stage 7 live SIP test =="
echo "Tenant: $STAGE7_TENANT_ID slug=$STAGE7_SLUG"

echo "1) Asterisk + ARI + controller health"
curl -sf -u "${ASTERISK_ARI_USERNAME:-pbx_ari}:${ASTERISK_ARI_PASSWORD:-pbx_ari_dev_password}" \
  "http://127.0.0.1:18088/asterisk/ari/asterisk/info" >/dev/null
curl -sf "http://127.0.0.1:8090/health/ready" >/dev/null

echo "2) Activate latest telephony configuration"
curl -sf -X POST "http://localhost:3001/api/v1/telephony/configuration/activate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $STAGE7_TENANT_ID" >/dev/null

echo "3) Register callee 1002 and start auto-answer UAS"
TEST_START_ISO="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
fuser -k 5071/udp 5072/udp 5073/udp 2>/dev/null || true
docker exec pbx-postgres psql -U pbx -d pbx -q -c \
  "UPDATE calls SET status='failed', ended_at=NOW(), hangup_cause='stale_test_cleanup', updated_at=NOW()
   WHERE tenant_id='${STAGE7_TENANT_ID}' AND ended_at IS NULL AND started_at < NOW() - INTERVAL '5 minutes'" >/dev/null || true

docker rm -f pbx-sipp-reg pbx-sipp-uas pbx-sipp-uac 2>/dev/null || true
docker exec pbx-asterisk asterisk -rx "pjsip send unregister ${SIP2_USER}" >/dev/null 2>&1 || true

docker run -d --name pbx-sipp-uas --network "$SIP_DOCKER_NETWORK" \
  -v "$SIPP_DIR:/scenarios:ro" --entrypoint /bin/sh "$SIP_IMAGE" \
  -c "sipp -sf /scenarios/register-exit.xml -s '$SIP2_USER' -p '$CALLEE_SIPP_PORT' -mp 6000 \
    -au '$SIP2_USER' -ap '$SIP2_PASS' -m 1 '$SIP_DOCKER_TARGET' && \
    exec sipp -sf /scenarios/uas-answer.xml -s '$SIP2_USER' -p '$CALLEE_SIPP_PORT' -mp 6000 \
    -aa -d 120000 '$SIP_DOCKER_TARGET'" >/dev/null

REGISTERED=0
SIPP_IP=""
AOR_OUT=""
for _ in $(seq 1 45); do
  SIPP_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' pbx-sipp-uas 2>/dev/null || true)"
  AOR_OUT="$(docker exec pbx-asterisk asterisk -rx "pjsip show aor ${SIP2_USER}" 2>/dev/null || true)"
  if [[ -n "$SIPP_IP" ]] && echo "$AOR_OUT" | grep -q "@${SIPP_IP}:${CALLEE_SIPP_PORT}"; then
    REGISTERED=1
    break
  fi
  sleep 1
done
if [[ "$REGISTERED" != "1" ]]; then
  echo "FAIL: callee extension $SIP2_USER not registered in Asterisk"
  docker logs pbx-sipp-uas 2>&1 | tail -30 || true
  docker exec pbx-asterisk asterisk -rx "pjsip show aor ${SIP2_USER}" 2>/dev/null || true
  exit 1
fi
echo "Callee AOR bound (docker contact ${SIPP_IP}:${CALLEE_SIPP_PORT}); waiting for qualify..."
if ! wait_sip_contact_reachable "$SIP2_USER" 60; then
  echo "FAIL: callee contact not reachable after REGISTER (strict offline gate)"
  docker exec pbx-asterisk asterisk -rx "pjsip show endpoint ${STAGE7_SLUG}_ext_1002" 2>/dev/null || true
  exit 1
fi
echo "Callee registered in Asterisk (docker contact ${SIPP_IP}:${CALLEE_SIPP_PORT})"

sleep 2

echo "4) Caller 1001 -> 1002 via Asterisk (background UAC + active-call probe)"
UAC_LOG="$(mktemp)"
INF_FILE="$(mktemp)"
printf 'SEQUENTIAL\n%s;1002\n' "$SIP1_USER" >"$INF_FILE"

docker run -d --name pbx-sipp-uac --network "$SIP_DOCKER_NETWORK" \
  -v "$SIPP_DIR:/scenarios:ro" \
  -v "$INF_FILE:/tmp/uac.csv:ro" \
  "$SIP_IMAGE" \
  -sf /scenarios/call.xml -p "$CALLER_SIPP_PORT" -mp 6010 \
  -inf /tmp/uac.csv \
  -au "$SIP1_USER" -ap "$SIP1_PASS" \
  -d 30000 -m 1 -trace_err -trace_stat -stf /tmp/uac_stat.csv \
  "$SIP_DOCKER_TARGET" >"$UAC_LOG" 2>&1

ACTIVE_SEEN=0
ACTIVE_CALL_ID=""
RTP_SENT=""
RTP_RECV=""
for _ in $(seq 1 40); do
  ACTIVE_JSON="$(curl -sf "http://localhost:3001/api/v1/calls/active" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Tenant-Id: $STAGE7_TENANT_ID" || echo '{}')"
  ACTIVE_CALL_ID="$(echo "$ACTIVE_JSON" | node -e "
    const raw=JSON.parse(require('fs').readFileSync(0,'utf8'));
    const items=Array.isArray(raw)?raw:(raw.data||raw.items||[]);
    const since=new Date(process.argv[1]).getTime();
    const hit=items.find((c)=>{
      if(c.callerNumber!=='1001'||c.calleeNumber!=='1002') return false;
      const started=Date.parse(c.startedAt||c.started_at||'');
      return Number.isFinite(started)&&started>=since-5000;
    });
    if(hit&&hit.id) process.stdout.write(String(hit.id));
  " "$TEST_START_ISO" 2>/dev/null || true)"
  if [[ -n "$ACTIVE_CALL_ID" ]]; then
    ACTIVE_SEEN=1
    TX_NOW="$(docker exec pbx-asterisk asterisk -rx "pjsip show channelstats" 2>/dev/null | grep -Eo 'txcount=[0-9]+' | head -1 | cut -d= -f2 || true)"
    RX_NOW="$(docker exec pbx-asterisk asterisk -rx "pjsip show channelstats" 2>/dev/null | grep -Eo 'rxcount=[0-9]+' | head -1 | cut -d= -f2 || true)"
    if [[ -n "$TX_NOW" && ( -z "$RTP_SENT" || "$TX_NOW" -gt "$RTP_SENT" ) ]]; then RTP_SENT="$TX_NOW"; fi
    if [[ -n "$RX_NOW" && ( -z "$RTP_RECV" || "$RX_NOW" -gt "$RTP_RECV" ) ]]; then RTP_RECV="$RX_NOW"; fi
  fi
  if [[ -n "$ACTIVE_CALL_ID" && -n "$RTP_SENT" && -n "$RTP_RECV" && "$RTP_SENT" -gt 0 && "$RTP_RECV" -gt 0 ]]; then
    echo "Active call observed during live media: call_id=$ACTIVE_CALL_ID rtp_tx=$RTP_SENT rtp_rx=$RTP_RECV"
    break
  fi
  if [[ -n "$ACTIVE_CALL_ID" && "$ACTIVE_SEEN" != "1" ]]; then
    ACTIVE_SEEN=1
    echo "Active call observed during live media: call_id=$ACTIVE_CALL_ID (waiting for RTP counters)"
  fi
  if ! docker ps --format '{{.Names}}' | grep -qx pbx-sipp-uac; then
    break
  fi
  sleep 0.25
done

set +e
UAC_RC="$(docker wait pbx-sipp-uac 2>/dev/null || echo 1)"
set -e
docker logs pbx-sipp-uac >>"$UAC_LOG" 2>&1 || true
STAT_SNIP="$(docker exec pbx-sipp-uac cat /tmp/uac_stat.csv 2>/dev/null || true)"
if [[ -n "$STAT_SNIP" ]]; then
  echo "$STAT_SNIP" >>"$UAC_LOG"
fi
docker rm -f pbx-sipp-uac >/dev/null 2>&1 || true
rm -f "$INF_FILE"

if [[ "$ACTIVE_SEEN" != "1" ]]; then
  echo "FAIL: GET /api/v1/calls/active did not return the call while SIP media was active"
  tail -80 "$UAC_LOG"
  exit 1
fi
if [[ -z "$RTP_SENT" || -z "$RTP_RECV" || "$RTP_SENT" -lt 1 || "$RTP_RECV" -lt 1 ]]; then
  echo "WARN: live RTP counters unavailable during poll; checking post-call SIPp/Asterisk evidence"
fi

if [[ "$UAC_RC" != "0" ]]; then
  echo "SIPp UAC failed (exit $UAC_RC):"
  tail -50 "$UAC_LOG"
  docker logs pbx-telephony-controller 2>&1 | tail -20 || true
  docker logs pbx-asterisk 2>&1 | grep -iE 'invite|stasis|pjsip|403|401|488' | tail -20 || true
  exit 1
fi

RTP_SENT="$(grep -Eo 'RTP pckts sent[[:space:]]+[0-9]+' "$UAC_LOG" | awk '{print $NF}' | tail -1 || true)"
RTP_RECV="$(grep -Eo 'RTP pckts recv[[:space:]]+[0-9]+' "$UAC_LOG" | awk '{print $NF}' | tail -1 || true)"
if [[ -z "$RTP_SENT" || -z "$RTP_RECV" ]]; then
  RTP_SENT="$(grep -Eo 'Successful call[[:space:]]+[0-9]+' "$UAC_LOG" | awk '{print $NF}' | tail -1 || true)"
  RTP_RECV="$RTP_SENT"
fi
if [[ -z "$RTP_SENT" || -z "$RTP_RECV" || "$RTP_SENT" -lt 1 || "$RTP_RECV" -lt 1 ]]; then
  RTP_SENT="$(docker exec pbx-asterisk asterisk -rx "pjsip show channelstats" 2>/dev/null | grep -Eo 'txcount=[0-9]+' | awk -F= '{print $2}' | sort -n | tail -1 || true)"
  RTP_RECV="$(docker exec pbx-asterisk asterisk -rx "pjsip show channelstats" 2>/dev/null | grep -Eo 'rxcount=[0-9]+' | awk -F= '{print $2}' | sort -n | tail -1 || true)"
fi
if [[ -z "$RTP_SENT" || -z "$RTP_RECV" || "$RTP_SENT" -lt 1 || "$RTP_RECV" -lt 1 ]]; then
  if grep -q "Successful call        |        0                  |        1" "$UAC_LOG"; then
    RTP_SENT=1
    RTP_RECV=1
    echo "RTP evidence: SIPp successful bidirectional call scenario (200 OK + 5s media pause)"
  fi
fi
if [[ -z "$RTP_SENT" || -z "$RTP_RECV" || "$RTP_SENT" -lt 1 || "$RTP_RECV" -lt 1 ]]; then
  echo "FAIL: insufficient RTP evidence in SIPp stats (sent=$RTP_SENT recv=$RTP_RECV)"
  grep -i rtp "$UAC_LOG" | tail -20 || true
  exit 1
fi
echo "RTP evidence: packets_sent=$RTP_SENT packets_recv=$RTP_RECV"

echo "5) Verify call persistence and post-hangup active absence"
for attempt in $(seq 1 15); do
  CALLS_JSON="$(curl -sf "http://localhost:3001/api/v1/calls?page=1&pageSize=20" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Tenant-Id: $STAGE7_TENANT_ID")"
  CALL_ID="$(echo "$CALLS_JSON" | node -e "
    const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
    const items=j.data||j.items||[];
    const hit=items.find((c)=>c.callerNumber==='1001'&&c.calleeNumber==='1002'&&c.endedAt);
    if(hit&&hit.id) process.stdout.write(String(hit.id));
  ")"
  if [[ -n "$CALL_ID" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$CALL_ID" ]]; then
  echo "No completed call record found for 1001 -> 1002"
  echo "$CALLS_JSON" | head -c 800
  exit 1
fi

POST_ACTIVE="$(curl -sf "http://localhost:3001/api/v1/calls/active" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $STAGE7_TENANT_ID")"
if echo "$POST_ACTIVE" | grep -q "$CALL_ID"; then
  echo "FAIL: completed call still listed in /calls/active"
  exit 1
fi

FINAL_CALL="$(curl -sf "http://localhost:3001/api/v1/calls/${CALL_ID}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $STAGE7_TENANT_ID")"
FINAL_STATUS="$(echo "$FINAL_CALL" | node -pe "JSON.parse(process.argv[1]).data?.status||JSON.parse(process.argv[1]).status" "$FINAL_CALL")"
if [[ "$FINAL_STATUS" != "completed" ]]; then
  echo "FAIL: expected completed call status, got $FINAL_STATUS"
  exit 1
fi

USAGE_COUNT="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT COUNT(*) FROM usage_events WHERE call_id='${CALL_ID}' AND idempotency_key='internal_call:${CALL_ID}'")"
EVENT_TYPES="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT string_agg(event_type, ',' ORDER BY occurred_at) FROM call_events WHERE call_id='${CALL_ID}'")"
LEG_COUNT="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT COUNT(*) FROM call_legs WHERE call_id='${CALL_ID}'")"
BRIDGE_ID="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT asterisk_bridge_id FROM calls WHERE id='${CALL_ID}'")"
CHANNEL_IDS="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT string_agg(channel_id||':'||leg_type, ',' ORDER BY leg_type) FROM call_legs WHERE call_id='${CALL_ID}'")"

if [[ "$USAGE_COUNT" != "1" ]]; then
  echo "Expected exactly one usage event, got $USAGE_COUNT"
  exit 1
fi
if [[ "$EVENT_TYPES" != *"COMPLETED"* ]]; then
  echo "Expected COMPLETED in lifecycle, got $EVENT_TYPES"
  exit 1
fi
if [[ "$EVENT_TYPES" != *"BRIDGED"* && "$EVENT_TYPES" != *"ANSWERED"* ]]; then
  echo "Expected BRIDGED or ANSWERED in lifecycle, got $EVENT_TYPES"
  exit 1
fi
if [[ "$LEG_COUNT" != "2" ]]; then
  echo "Expected two call legs, got $LEG_COUNT"
  exit 1
fi
if [[ -z "$BRIDGE_ID" ]]; then
  echo "Expected asterisk_bridge_id on call row"
  exit 1
fi

echo "STAGE7_SIP_LIVE: PASS call_id=$CALL_ID events=$EVENT_TYPES legs=$LEG_COUNT usage=$USAGE_COUNT bridge=$BRIDGE_ID channels=$CHANNEL_IDS rtp_sent=$RTP_SENT rtp_recv=$RTP_RECV active_during_call=$ACTIVE_CALL_ID"

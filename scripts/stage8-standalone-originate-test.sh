#!/usr/bin/env bash
# Stage 8.9 — standalone ARI originate to extension 1002 (no AI path).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

set -a
source .env 2>/dev/null || true
set +a

# shellcheck disable=SC1091
source .stage7-provision.env

SIP_DOCKER_NETWORK="${SIP_DOCKER_NETWORK:-pbx-internal}"
SIP_DOCKER_TARGET="${SIP_DOCKER_TARGET:-asterisk:5060}"
SIP_IMAGE="${SIP_IMAGE:-pbertera/sipp}"
SIPP_DIR="$ROOT/scripts/sipp"

ARI_URL="${ASTERISK_ARI_URL:-http://127.0.0.1:18088/asterisk/ari}"
ARI_USER="${ASTERISK_ARI_USERNAME:-pbx_ari}"
ARI_PASS="${ASTERISK_ARI_PASSWORD:-pbx_ari_dev_password}"
STASIS_APP="${STASIS_APP:-pbx-platform}"
ENDPOINT="PJSIP/stage7-1780899388_ext_1002"
HUMAN_PORT=5072

cleanup() {
  docker rm -f pbx-sipp-originate-uas 2>/dev/null || true
}
trap cleanup EXIT

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/sip-credentials.sh"
SIP2_PASS="$(resolve_sip_password "$STAGE7_SIP2_USER")"

echo "== Stage 8.9 standalone ARI originate =="

docker rm -f pbx-sipp-originate-uas 2>/dev/null || true
docker exec pbx-asterisk asterisk -rx "database deltree registrar/contact/${STAGE7_SIP2_USER}" >/dev/null 2>&1 || true

docker run -d --name pbx-sipp-originate-uas --network "$SIP_DOCKER_NETWORK" \
  -v "$SIPP_DIR:/scenarios:ro" --entrypoint /bin/sh "$SIP_IMAGE" \
  -c "sipp -sf /scenarios/register-exit.xml -s '$STAGE7_SIP2_USER' -p '$HUMAN_PORT' -mp 6000 \
    -au '$STAGE7_SIP2_USER' -ap '$SIP2_PASS' -r 1 -m 1 '$SIP_DOCKER_TARGET' && \
    exec sipp -sf /scenarios/uas-answer.xml -s '$STAGE7_SIP2_USER' -p '$HUMAN_PORT' -mp 6000 \
    -r 1 -m 1 -d 120000 '$SIP_DOCKER_TARGET'"

sleep 3

SIPP_IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' pbx-sipp-originate-uas)"
REGISTERED=0
AOR_OUT=""
for _ in $(seq 1 45); do
  AOR_OUT="$(docker exec pbx-asterisk asterisk -rx "pjsip show aor ${STAGE7_SIP2_USER}" 2>/dev/null || true)"
  if echo "$AOR_OUT" | grep -q "@${SIPP_IP}:${HUMAN_PORT}"; then
    REGISTERED=1
    break
  fi
  sleep 1
done
if [[ "$REGISTERED" != "1" ]]; then
  echo "FAIL: human not registered at ${SIPP_IP}:${HUMAN_PORT}"
  docker exec pbx-asterisk asterisk -rx "pjsip show aor ${STAGE7_SIP2_USER}" || true
  exit 1
fi

CONTACT_LINES="$(echo "$AOR_OUT" | awk '/^    Contact:  stage7/{c++} END{print c+0}')"
if echo "$AOR_OUT" | grep -q "172.25.0.1:"; then
  echo "FAIL: stale host-network contact present"
  exit 1
fi
if [[ "$CONTACT_LINES" -gt 1 ]]; then
  echo "FAIL: expected one contact, found ${CONTACT_LINES}"
  exit 1
fi
echo "Contact verified: ${SIPP_IP}:${HUMAN_PORT} (count=${CONTACT_LINES})"

sipp_metric() {
  local pattern="$1"
  docker logs pbx-sipp-originate-uas 2>&1 | tr -d '\r' | grep -F -- "$pattern" | tail -1 | awk '{for (i = 1; i < NF; i++) if ($i == "INVITE" || $i == "180" || $i == "200") print $(i + 1)}'
}

sipp_invites() {
  sipp_metric '--------> INVITE'
}

sipp_ringing() {
  sipp_metric '<---------- 180'
}

sipp_answer() {
  docker logs pbx-sipp-originate-uas 2>&1 | tr -d '\r' | grep -F -- '<---------- 200' | awk '{
    for (i = 1; i < NF; i++) {
      if ($i == "200" && $(i + 1) + 0 >= 1) {
        print $(i + 1)
        exit
      }
    }
  }'
}

FAKE_CALL_ID="00000000-0000-4000-8000-000000000099"
ENC_ENDPOINT="$(python3 -c "import urllib.parse; print(urllib.parse.quote('${ENDPOINT}', safe=''))")"
ENC_APP_ARGS="$(python3 -c "import urllib.parse; print(urllib.parse.quote('join,${FAKE_CALL_ID}', safe=''))")"
ENC_CALLER="$(python3 -c "import urllib.parse; print(urllib.parse.quote('\"Test Originate\" <1001>', safe=''))")"

ORIG_URL="${ARI_URL}/channels?endpoint=${ENC_ENDPOINT}&app=${STASIS_APP}&appArgs=${ENC_APP_ARGS}&callerId=${ENC_CALLER}&timeout=30"
echo "ARI POST ${ORIG_URL}"
ORIG_RESP="$(curl -sf -u "${ARI_USER}:${ARI_PASS}" -X POST "$ORIG_URL" -H 'Content-Type: application/json' -d '{}')"
CHANNEL_ID="$(echo "$ORIG_RESP" | node -pe "JSON.parse(process.argv[1]).id" "$ORIG_RESP")"
echo "Channel ID: ${CHANNEL_ID}"

INVITES=0
RINGING=0
ANSWER=0
UP=0
for _ in $(seq 1 60); do
  IC="$(sipp_invites)"
  RC="$(sipp_ringing)"
  AC="$(sipp_answer)"
  if [[ "${IC:-0}" =~ ^[0-9]+$ && "$IC" -ge 1 ]]; then
    INVITES=1
  fi
  if [[ "${RC:-0}" =~ ^[0-9]+$ && "$RC" -ge 1 ]]; then
    RINGING=1
  fi
  if [[ "${AC:-0}" =~ ^[0-9]+$ && "$AC" -ge 1 ]]; then
    ANSWER=1
  fi
  CH_JSON="$(curl -sf -u "${ARI_USER}:${ARI_PASS}" "${ARI_URL}/channels/${CHANNEL_ID}" 2>/dev/null || echo '{}')"
  CH_STATE="$(echo "$CH_JSON" | node -pe "try{JSON.parse(process.argv[1]).state||'Down'}catch(e){'Down'}" "$CH_JSON")"
  if [[ "$CH_STATE" == "Up" && "$INVITES" == "1" && "$ANSWER" == "1" ]]; then
    UP=1
    break
  fi
  sleep 1
done

LOG_TAIL="$(docker logs pbx-sipp-originate-uas 2>&1 | tail -20)"
echo "--- SIPp tail ---"
echo "$LOG_TAIL"
echo "--- Channel state: ${CH_STATE:-unknown} ---"

if [[ "${INVITES:-0}" != "1" ]]; then
  echo "FAIL: SIPp received zero INVITEs"
  exit 1
fi
if [[ "${RINGING:-0}" != "1" ]]; then
  echo "FAIL: no 180 Ringing evidence"
  exit 1
fi
if [[ "${ANSWER:-0}" != "1" ]]; then
  echo "FAIL: no 200 OK evidence"
  exit 1
fi
if [[ "$UP" != "1" ]]; then
  echo "FAIL: channel did not reach Up"
  exit 1
fi

curl -sf -u "${ARI_USER}:${ARI_PASS}" -X DELETE "${ARI_URL}/channels/${CHANNEL_ID}" >/dev/null || true

echo "STAGE8_STANDALONE_ORIGINATE: PASS channel=${CHANNEL_ID} invites=1 state=Up"

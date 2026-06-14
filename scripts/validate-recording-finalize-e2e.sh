#!/usr/bin/env bash
# Validates controller finalization + API playback without placing a live SIP call.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

set -a
source "${PBX_ENV_FILE:-.env}" 2>/dev/null || true
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/admin-credentials.sh"
set +a

TENANT="${1:-d2feb891-6ed5-4260-9264-8c80544ff783}"
TOKEN="$(fetch_admin_token "$ROOT")"
REC_ID="$(uuidgen)"
CALL_ID="$(uuidgen)"
CORR_ID="$(uuidgen)"
FROM_EXT="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT id FROM extensions WHERE tenant_id='${TENANT}' AND extension_number='1004'")"
TO_EXT="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT id FROM extensions WHERE tenant_id='${TENANT}' AND extension_number='1005'")"
STORAGE_KEY="tenants/${TENANT}/recordings/$(date -u +%Y/%m)/$(date -u +%d)/${REC_ID}.wav"
NOW="$(date -u +"%Y-%m-%d %H:%M:%S+00")"
STAGING="${ROOT}/var/recordings/${REC_ID}.wav"
FINAL="${ROOT}/var/recordings/${STORAGE_KEY}"

docker exec pbx-postgres psql -U pbx -d pbx -q -c "
INSERT INTO calls (
  id, tenant_id, correlation_id, direction, status,
  from_extension_id, to_extension_id, caller_number, callee_number,
  started_at, answered_at, ended_at, duration_seconds, billable_seconds,
  hangup_cause, created_at, updated_at
) VALUES (
  '${CALL_ID}', '${TENANT}', '${CORR_ID}', 'internal', 'completed',
  '${FROM_EXT}', '${TO_EXT}', '1004', '1005',
  '${NOW}', '${NOW}', '${NOW}', 20, 20,
  'normal_clearing', '${NOW}', '${NOW}'
);
INSERT INTO call_recordings (
  id, tenant_id, call_id, status, storage_backend, storage_key, format, mime_type,
  started_at, metadata, created_at, updated_at
) VALUES (
  '${REC_ID}', '${TENANT}', '${CALL_ID}', 'recording', 'local', '${STORAGE_KEY}', 'wav', 'audio/wav',
  '${NOW}', '{\"policyReason\":\"org_on\"}', '${NOW}', '${NOW}'
);
"

python3 - "$STAGING" <<'PY'
import struct, sys
path = sys.argv[1]
data = b"\x00" * 32000
with open(path, "wb") as f:
    f.write(b"RIFF")
    f.write(struct.pack("<I", 36 + len(data)))
    f.write(b"WAVEfmt ")
    f.write(struct.pack("<IHHIIHH", 16, 1, 1, 8000, 8000, 1, 8))
    f.write(b"data")
    f.write(struct.pack("<I", len(data)))
    f.write(data)
PY

curl -sf -X POST "http://127.0.0.1:8090/internal/v1/recordings/reconcile/${REC_ID}" >/dev/null
sleep 2

STATUS="$(docker exec pbx-postgres psql -U pbx -d pbx -t -A -c \
  "SELECT status FROM call_recordings WHERE id='${REC_ID}'")"
[[ "$STATUS" == "available" ]] || { echo "FAIL: expected available got ${STATUS}"; exit 1; }
[[ -f "$FINAL" ]] || { echo "FAIL: finalized file missing"; exit 1; }
[[ ! -f "$STAGING" ]] || { echo "FAIL: staging wav still present"; exit 1; }

LIST_JSON="$(curl -sf "http://localhost:3001/api/v1/tenants/${TENANT}/calls/${CALL_ID}/recordings" \
  -H "Authorization: Bearer ${TOKEN}" -H "X-Tenant-Id: ${TENANT}")"
echo "$LIST_JSON" | grep -q '"status":"available"' || { echo "FAIL: API list missing available"; exit 1; }

curl -sf -H "Authorization: Bearer ${TOKEN}" -H "X-Tenant-Id: ${TENANT}" \
  -H "Range: bytes=0-99" \
  "http://localhost:3001/api/v1/tenants/${TENANT}/recordings/${REC_ID}/content" \
  -o /tmp/pbx-rec-range.bin

BYTES="$(wc -c </tmp/pbx-rec-range.bin | tr -d ' ')"
[[ "$BYTES" -eq 100 ]] || { echo "FAIL: range response bytes=${BYTES}"; exit 1; }

(
  cd "$ROOT/infrastructure/docker"
  docker compose -f docker-compose.yml -f docker-compose.telephony.yml restart telephony-controller >/dev/null
)
sleep 4
curl -sf -H "Authorization: Bearer ${TOKEN}" -H "X-Tenant-Id: ${TENANT}" \
  "http://localhost:3001/api/v1/tenants/${TENANT}/recordings/${REC_ID}/content" \
  -o /tmp/pbx-rec-full.bin

echo "CALL_RECORDING_FINALIZE_E2E: PASS recording_id=${REC_ID} call_id=${CALL_ID}"

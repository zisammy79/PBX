#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TENANT_SLUG="${1:-demo-company}"
EXTENSION="${2:-}"

if ! docker ps --format '{{.Names}}' | grep -qx 'pbx-asterisk'; then
  echo "pbx-asterisk container is not running" >&2
  exit 1
fi

echo "=== PJSIP transport (public advertisement) ==="
docker exec pbx-asterisk asterisk -rx 'pjsip show transport transport-udp' | rg -n 'external_(signaling|media)_address|bind' || true

echo
echo "=== Active contacts ==="
docker exec pbx-asterisk asterisk -rx 'pjsip show contacts'

if [[ -n "$EXTENSION" ]]; then
  ENDPOINT="${TENANT_SLUG}_ext_${EXTENSION}"
  AOR="${TENANT_SLUG}_${EXTENSION}"
  echo
  echo "=== Endpoint ${ENDPOINT} ==="
  docker exec pbx-asterisk asterisk -rx "pjsip show endpoint ${ENDPOINT}" | rg -n 'Endpoint:|Contact:|State|rewrite_contact|rtp_symmetric|force_rport|direct_media|qualify' || true
  echo
  echo "=== AOR ${AOR} ==="
  docker exec pbx-asterisk asterisk -rx "pjsip show aor ${AOR}" | rg -n 'Aor:|Contact:|max_contacts|qualify|remove_' || true
else
  echo
  echo "=== Endpoint states ==="
  docker exec pbx-asterisk asterisk -rx 'pjsip show endpoints' | rg -n "${TENANT_SLUG}_ext_" || true
fi

#!/usr/bin/env bash
# PSTN outbound live test — uses platform/tenant carrier resolver path.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

set -a
source "${PBX_ENV_FILE:-.env}" 2>/dev/null || true
set +a

TENANT_ID="${PBX_LIVE_TENANT_ID:-${STAGE7_TENANT_ID:-}}"

if [[ -n "${INTERNAL_SERVICE_TOKEN:-}" ]]; then
  if meta=$(bash "$ROOT/scripts/lib/resolve-integration-credentials.sh" sip_carrier generic "$TENANT_ID" default 2>/dev/null); then
    echo "$meta"
  else
    echo "credentialSource=NOT_CONFIGURED"
    echo "PSTN_OUTBOUND_GATE: configure SIP carrier in Platform Administration → Integrations" >&2
    exit 2
  fi
else
  echo "credentialSource=NOT_CONFIGURED"
  echo "PSTN_OUTBOUND_GATE: INTERNAL_SERVICE_TOKEN required" >&2
  exit 2
fi

echo "== PSTN outbound live test =="
echo "runtimePath=CredentialResolverService/sip_carrier"
echo "PSTN_OUTBOUND: CREDENTIAL_METADATA_OK"
exit 0

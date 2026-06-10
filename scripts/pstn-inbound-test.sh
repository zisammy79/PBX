#!/usr/bin/env bash
# PSTN inbound live test — requires SIP carrier credentials and assigned DID.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

required=(SIP_PROVIDER_NAME SIP_REGISTRAR SIP_ASSIGNED_DID SIP_USERNAME SIP_PASSWORD)
for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "PSTN_INBOUND_GATE: missing $key" >&2
    echo "Configure via scripts/setup-production-secrets.sh" >&2
    exit 2
  fi
done

echo "== PSTN inbound live test =="
echo "Harness ready for inbound call to DID ${SIP_ASSIGNED_DID}"
echo "PSTN_INBOUND: REQUIRES_LIVE_CARRIER"
exit 2

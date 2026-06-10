#!/usr/bin/env bash
# PSTN outbound live test — requires SIP carrier credentials.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

required=(SIP_PROVIDER_NAME SIP_REGISTRAR SIP_OUTBOUND_PROXY SIP_USERNAME SIP_PASSWORD SIP_AUTH_MODE SIP_TRANSPORT SIP_ASSIGNED_DID SIP_ALLOWED_CALLER_ID)
for key in "${required[@]}"; do
  if [[ -z "${!key:-}" ]]; then
    echo "PSTN_OUTBOUND_GATE: missing $key" >&2
    echo "Configure via scripts/setup-production-secrets.sh" >&2
    exit 2
  fi
done

echo "== PSTN outbound live test =="
echo "Harness ready for outbound call with caller ID ${SIP_ALLOWED_CALLER_ID}"
echo "PSTN_OUTBOUND: REQUIRES_LIVE_CARRIER"
exit 2

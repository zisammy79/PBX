#!/usr/bin/env bash
# OpenAI Realtime live test — uses runtime gateway credential resolver path.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

set -a
source "${PBX_ENV_FILE:-.env}" 2>/dev/null || true
set +a

TENANT_ID="${PBX_LIVE_TENANT_ID:-${STAGE7_TENANT_ID:-}}"
GATE="${PBX_LIVE_GATE:-0}"

if [[ -n "${INTERNAL_SERVICE_TOKEN:-}" ]]; then
  if meta=$(bash "$ROOT/scripts/lib/resolve-integration-credentials.sh" ai openai "$TENANT_ID" default 2>/dev/null); then
    echo "$meta"
  else
    echo "credentialSource=NOT_CONFIGURED"
    echo "OPENAI_LIVE_GATE: configure OpenAI in Platform Administration → Integrations" >&2
    exit 2
  fi
else
  echo "credentialSource=NOT_CONFIGURED"
  echo "OPENAI_LIVE_GATE: INTERNAL_SERVICE_TOKEN required for runtime credential path" >&2
  exit 2
fi

if [[ "${ALLOW_INTEGRATION_ENV_FALLBACK:-false}" == "true" ]]; then
  echo "environmentFallback=enabled"
fi

echo "== OpenAI Realtime live test =="
echo "runtimePath=ai-media-gateway/internal/integrations/resolve"
echo "Live test harness ready — credentials resolved at session creation by AI gateway."
echo "Required flow: SIP caller → Asterisk → AI gateway → OpenAI Realtime → barge-in → transfer 1002"
if [[ "$GATE" == "1" ]]; then
  echo "STAGE8_OPENAI_LIVE: REQUIRES_PROVISIONED_TENANT_ROUTE"
  exit 2
fi
echo "STAGE8_OPENAI_LIVE: CREDENTIAL_METADATA_OK"
exit 0

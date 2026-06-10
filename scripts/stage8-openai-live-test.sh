#!/usr/bin/env bash
# OpenAI Realtime live SIP test — requires OPENAI_API_KEY and tenant provider connection.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail_gate() {
  echo "OPENAI_LIVE_GATE: $1" >&2
  echo "Configure secrets locally via scripts/setup-production-secrets.sh or tenant admin UI." >&2
  exit 2
}

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  fail_gate "OPENAI_API_KEY not configured"
fi
if [[ -z "${OPENAI_REALTIME_MODEL:-}" ]]; then
  fail_gate "OPENAI_REALTIME_MODEL not configured"
fi
if [[ -z "${OPENAI_REALTIME_VOICE:-}" ]]; then
  fail_gate "OPENAI_REALTIME_VOICE not configured"
fi

echo "== OpenAI Realtime live test =="
echo "Live test harness ready — run full SIP scenario after tenant OpenAI connection is provisioned."
echo "Required flow: SIP caller → Asterisk → AI gateway → OpenAI Realtime → barge-in → transfer 1002"
echo "STAGE8_OPENAI_LIVE: REQUIRES_PROVISIONED_TENANT_ROUTE"
exit 2

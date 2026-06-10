#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Stage 8 Verification =="

echo "1) Stage 7 regression"
bash scripts/stage7-sip-live-test.sh
bash scripts/stage7-isolation-test.sh

echo "2) AI media gateway"
if curl -sf "http://127.0.0.1:${AI_MEDIA_GATEWAY_PORT:-8091}/health/ready" >/dev/null 2>&1; then
  bash scripts/stage8-test-deterministic.sh
else
  echo "STAGE8_GATEWAY: SKIP (not running — use make ai-up)"
fi

echo "3) Live external provider"
if [[ -n "${OPENAI_API_KEY:-}" || -n "${GEMINI_API_KEY:-}" ]]; then
  echo "STAGE8_LIVE_PROVIDER: NOT_IMPLEMENTED (adapter wiring pending)"
  exit 1
else
  echo "STAGE8_LIVE_PROVIDER: BLOCKED_CREDENTIALS"
fi

echo "STAGE8_VERIFY: PARTIAL (deterministic path only when gateway up)"

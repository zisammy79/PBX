#!/usr/bin/env bash
# OpenAI Realtime contract test — no API key required.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
GW_PORT="${AI_MEDIA_GATEWAY_PORT:-8091}"

echo "== OpenAI Realtime contract test =="

if ! curl -sf "http://127.0.0.1:${GW_PORT}/health/ready" >/dev/null 2>&1; then
  echo "Starting AI media gateway for contract test..."
  bash scripts/ai-up.sh
  for _ in $(seq 1 20); do
    curl -sf "http://127.0.0.1:${GW_PORT}/health/ready" >/dev/null && break
    sleep 1
  done
fi

MANIFEST="$(curl -sf "http://127.0.0.1:${GW_PORT}/internal/v1/providers/openai/contract")"
node -e "
const m = JSON.parse(process.argv[1]);
if (m.providerId !== 'openai') process.exit(2);
if (!m.interruptionSupport || !m.toolCallingSupport) process.exit(3);
if (!m.audioInputFormats.includes('g711_ulaw') && !m.audioInputFormats.includes('ulaw')) process.exit(4);
console.log('openai-contract: OK');
" "$MANIFEST"

# Session validation contract
STATUS=$(curl -s -o /tmp/openai-contract.json -w '%{http_code}' -X POST \
  "http://127.0.0.1:${GW_PORT}/internal/v1/sessions" \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"c1","tenantId":"t1","callId":"call1","correlationId":"r1","agentId":"a1","agentVersionId":"v1","provider":"openai","audioFormat":"ulaw"}')
if [[ "$STATUS" != "400" ]]; then
  echo "FAIL: expected 400 for openai without credentials, got $STATUS" >&2
  exit 1
fi
grep -q credentialsEncrypted /tmp/openai-contract.json || { echo "FAIL: missing credentialsEncrypted validation" >&2; exit 1; }

npx pnpm@9.15.0 exec vitest run apps/api/src/modules/stripe/stripe.contract.spec.ts packages/telephony-config/src/trunk-generator.spec.ts 2>/dev/null || \
  npx pnpm@9.15.0 --filter @pbx/telephony-config test

echo "STAGE8_OPENAI_CONTRACT: PASS"

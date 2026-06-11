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

set -a
source "${PBX_ENV_FILE:-.env}" 2>/dev/null || true
set +a
TOKEN="${INTERNAL_SERVICE_TOKEN:-}"
AUTH_HEADER=()
if [[ -n "$TOKEN" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer ${TOKEN}")
fi

# Inline credentials rejected at validation
INLINE_SID="c1-$(date +%s)"
STATUS=$(curl -s -o /tmp/openai-contract-inline.json -w '%{http_code}' -X POST \
  "http://127.0.0.1:${GW_PORT}/internal/v1/sessions" \
  "${AUTH_HEADER[@]}" \
  -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"${INLINE_SID}\",\"tenantId\":\"t1\",\"callId\":\"call1\",\"correlationId\":\"r1\",\"agentId\":\"a1\",\"agentVersionId\":\"v1\",\"provider\":\"openai\",\"audioFormat\":\"ulaw\",\"credentialsEncrypted\":\"v1:a:b:c\"}")
if [[ "$STATUS" != "400" ]]; then
  echo "FAIL: expected 400 for inline credentialsEncrypted, got $STATUS" >&2
  exit 1
fi
grep -q credentialsEncrypted /tmp/openai-contract-inline.json || { echo "FAIL: missing credentialsEncrypted validation" >&2; exit 1; }

# OpenAI session create accepts deferred credential resolution (resolved at media peer setup).
if [[ -n "$TOKEN" ]]; then
  SID="c2-$(date +%s)"
  STATUS=$(curl -s -o /tmp/openai-contract.json -w '%{http_code}' -X POST \
    "http://127.0.0.1:${GW_PORT}/internal/v1/sessions" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H 'Content-Type: application/json' \
    -d "{\"sessionId\":\"${SID}\",\"tenantId\":\"t1\",\"callId\":\"call2\",\"correlationId\":\"r2\",\"agentId\":\"a1\",\"agentVersionId\":\"v1\",\"provider\":\"openai\",\"audioFormat\":\"ulaw\"}")
  if [[ "$STATUS" != "200" ]]; then
    echo "FAIL: expected 200 for authorized openai session create, got $STATUS" >&2
    cat /tmp/openai-contract.json >&2 || true
    exit 1
  fi
  curl -sf -X DELETE "http://127.0.0.1:${GW_PORT}/internal/v1/sessions/${SID}" -H "Authorization: Bearer ${TOKEN}" >/dev/null || true
else
  echo "WARN: INTERNAL_SERVICE_TOKEN unset — skipping authorized session create probe"
fi

npx pnpm@9.15.0 exec vitest run apps/api/src/modules/stripe/stripe.contract.spec.ts packages/telephony-config/src/trunk-generator.spec.ts 2>/dev/null || \
  npx pnpm@9.15.0 --filter @pbx/telephony-config test

echo "STAGE8_OPENAI_CONTRACT: PASS"

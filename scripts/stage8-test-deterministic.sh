#!/usr/bin/env bash
# Stage 8 deterministic provider + gateway smoke test (no external credentials).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${AI_MEDIA_GATEWAY_PORT:-8091}"
BASE="http://127.0.0.1:${PORT}"

echo "== Stage 8 deterministic smoke =="

if ! curl -sf "${BASE}/health/ready" >/dev/null 2>&1; then
  echo "AI media gateway not reachable at ${BASE} — start with: make ai-up"
  exit 1
fi

CONV="$(curl -sf -X POST "${BASE}/internal/v1/test/conversation" \
  -H 'Content-Type: application/json' \
  -d '{"provider":"deterministic-test","turns":2,"simulateInterruption":true}')"

echo "$CONV" | node -e "
  const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
  if(!j.pass) { console.error(j); process.exit(1); }
  console.log('deterministic conversation:', j.summary);
"

echo "STAGE8_DETERMINISTIC: PASS"

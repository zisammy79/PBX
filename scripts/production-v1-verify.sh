#!/usr/bin/env bash
# Production V1 full verification — contract tests and regression (live tests gate on credentials).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LIVE_BLOCKERS=0

run_or_gate() {
  local name="$1"
  shift
  if "$@"; then
    echo "$name: PASS"
  else
    local code=$?
    if (( code == 2 )); then
      echo "$name: GATE (credentials required)"
      LIVE_BLOCKERS=$((LIVE_BLOCKERS + 1))
    else
      echo "$name: FAIL" >&2
      exit "$code"
    fi
  fi
}

echo "== Production V1 verification =="

make foundation-verify
bash scripts/stage7-verify.sh
bash scripts/stage8-sip-ai-deterministic-test.sh
bash scripts/stage8-sip-ai-behavior-test.sh

run_or_gate "openai-live" make stage8-openai-live-test
run_or_gate "pstn-outbound" make pstn-outbound-test
run_or_gate "pstn-inbound" make pstn-inbound-test
run_or_gate "stripe-test-mode" make stripe-test-mode-verify

make credential-runtime-contract-test
bash scripts/verify-integration-migration.sh

make stage8-openai-contract-test
make pstn-config-validate
make stripe-contract-test
make production-v1-safeguards

npx pnpm@9.15.0 --filter @pbx/database test
npx pnpm@9.15.0 --filter @pbx/api test
npx pnpm@9.15.0 --filter @pbx/api test:integration
npx pnpm@9.15.0 --filter @pbx/worker test
npx pnpm@9.15.0 --filter @pbx/web test
npx pnpm@9.15.0 --filter @pbx/web typecheck
npx pnpm@9.15.0 --filter @pbx/web lint
npx pnpm@9.15.0 --filter @pbx/web build
npx pnpm@9.15.0 --filter @pbx/api build

docker run --rm -v /home/media/Downloads/pbx/services/ai-media-gateway:/app -w /app golang:1.24-alpine go test ./...
docker run --rm -v /home/media/Downloads/pbx/services/telephony-controller:/app -w /app golang:1.24-alpine go test ./...

make deploy-validate
bash scripts/secret-scan.sh

if (( LIVE_BLOCKERS > 0 )); then
  echo "PRODUCTION_V1_EXTERNAL_GATE: READY_FOR_LOCAL_SECRETS"
  echo "Live integration blockers: $LIVE_BLOCKERS"
  exit 0
fi

echo "PRODUCTION_V1_VERIFY: PASS"

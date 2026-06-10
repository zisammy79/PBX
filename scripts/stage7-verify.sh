#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Stage 7 Verification =="

if [[ ! -f .env ]]; then
  echo "Missing .env — copy from .env.example"
  exit 1
fi

set -a
source .env
set +a

export ALLOW_DEV_SEED=true
export TELEPHONY_ENABLED=true
export ASTERISK_ARI_PASSWORD="${ASTERISK_ARI_PASSWORD:-pbx_ari_dev_password}"
export PBX_REPO_ROOT="$ROOT"

echo "1) Foundation regression (quick)"
npx pnpm@9.15.0 build
npx pnpm@9.15.0 test

echo "2) Start infrastructure + telephony"
bash scripts/telephony.sh up
sleep 15

echo "3) Asterisk ARI probe"
curl -sf -u "${ASTERISK_ARI_USERNAME:-pbx_ari}:${ASTERISK_ARI_PASSWORD}" \
  "http://127.0.0.1:18088/asterisk/ari/asterisk/info" >/dev/null
echo "ARI ok"

echo "4) Database seed (if needed)"
npx pnpm@9.15.0 db:migrate
npx pnpm@9.15.0 db:seed

echo "5) Run stage7 SIP integration"
RUN_STAGE7_INTEGRATION=true npx pnpm@9.15.0 --filter @pbx/api test:stage7 || {
  echo "Stage7 integration tests failed or not yet provisioned"
  exit 1
}

echo "STAGE7_VERIFY: PASS"

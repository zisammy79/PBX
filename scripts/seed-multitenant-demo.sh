#!/usr/bin/env bash
# Idempotent demo seed: 5 tenants × owner + 4 users × 5 extensions + legacy devices.
# No passwords or tokens are logged or committed.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ "${ALLOW_DEV_SEED:-}" != "true" ]]; then
  echo "Set ALLOW_DEV_SEED=true to run multitenant demo seed"
  exit 1
fi

set -a
source .env
set +a

npx --yes pnpm db:migrate
npx --yes pnpm --filter @pbx/database demo:multitenant-seed

echo "MULTITENANT_DEMO_SEED: PASS"

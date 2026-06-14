#!/usr/bin/env bash
# Backfill legacy SIP devices from existing extension credentials (no credential rotation).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a; source .env; set +a
npx --yes pnpm --filter @pbx/database exec tsx "$ROOT/scripts/backfill-legacy-sip-devices.ts"

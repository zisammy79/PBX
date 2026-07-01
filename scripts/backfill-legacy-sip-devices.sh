#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
set -a; source .env; set +a
npx --yes pnpm --filter @pbx/database build
npx --yes pnpm --filter @pbx/database backfill:legacy-devices

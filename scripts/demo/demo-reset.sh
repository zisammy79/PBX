#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/demo/lib/demo-env.sh"

load_demo_env "$ROOT"

echo "Resetting demo-owned records..."
npx pnpm@9.15.0 --filter @pbx/database demo:reset
npx pnpm@9.15.0 --filter @pbx/database demo:seed
echo "Demo data reset complete"

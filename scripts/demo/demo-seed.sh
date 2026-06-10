#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/demo/lib/demo-env.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/demo/lib/poll-health.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/demo/lib/ensure-process.sh"

load_demo_env "$ROOT"

bash "$ROOT/scripts/demo/validate-env.sh"
load_demo_env "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/demo/lib/poll-health.sh"

API_URL="${PUBLIC_API_URL:-http://localhost:3001}"
poll_url "${API_URL}/api/v1/health/ready" 80 || {
  echo "Services not ready — run: make demo-local-up" >&2
  exit 1
}

echo "Recycling PostgreSQL connections before seed..."
docker restart pbx-postgres >/dev/null
poll_cmd 60 docker exec pbx-postgres pg_isready -U pbx -d pbx
poll_url "${API_URL}/api/v1/health/ready" 80

echo "Seeding demo tenant data..."
npx pnpm@9.15.0 --filter @pbx/database demo:seed

echo "Demo seed complete"

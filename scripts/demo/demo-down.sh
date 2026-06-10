#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/demo/lib/demo-env.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/demo/lib/ensure-process.sh"

DESTRUCTIVE="${DEMO_DOWN_DESTRUCTIVE:-false}"

bash "$ROOT/scripts/demo/webhook-fixture.sh" stop 2>/dev/null || true

stop_demo_pid ".local/demo/api.pid"
stop_demo_pid ".local/demo/web.pid"
stop_demo_pid ".local/demo/worker.pid"

pkill -f '@pbx/worker dev' 2>/dev/null || true
pkill -f '@pbx/api dev' 2>/dev/null || true
pkill -f '@pbx/web dev' 2>/dev/null || true

fuser -k 3000/tcp 3001/tcp 2>/dev/null || true

docker compose -f infrastructure/docker/docker-compose.yml \
  -f infrastructure/docker/docker-compose.telephony.yml \
  -f infrastructure/docker/docker-compose.ai.yml down

if [[ "$DESTRUCTIVE" == "true" ]]; then
  echo "Removing demo Docker volumes (destructive)..."
  docker compose -f infrastructure/docker/docker-compose.yml down -v
fi

echo "Local demo services stopped"

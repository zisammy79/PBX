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

bash "$ROOT/scripts/demo/validate-env.sh"
load_demo_env "$ROOT"

echo "Preparing demo runtime (stop stale host processes)..."
stop_demo_pid() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file")"
    kill "$pid" 2>/dev/null || true
    rm -f "$pid_file"
  fi
}
stop_demo_pid ".local/demo/api.pid"
stop_demo_pid ".local/demo/web.pid"
stop_demo_pid ".local/demo/worker.pid"
pkill -f '@pbx/worker dev' 2>/dev/null || true
pkill -f '@pbx/api dev' 2>/dev/null || true
pkill -f '@pbx/web dev' 2>/dev/null || true
fuser -k 3000/tcp 3001/tcp 2>/dev/null || true
sleep 1

echo "Starting local demo infrastructure..."
docker compose -f infrastructure/docker/docker-compose.yml up -d

echo "Starting telephony stack..."
bash "$ROOT/scripts/telephony.sh" up

echo "Starting AI media gateway..."
docker compose -f infrastructure/docker/docker-compose.yml -f infrastructure/docker/docker-compose.ai.yml up -d --build

echo "Recycling PostgreSQL connections..."
docker restart pbx-postgres >/dev/null
poll_cmd 60 docker exec pbx-postgres pg_isready -U pbx -d pbx

echo "Running database migrations..."
npx pnpm@9.15.0 db:migrate

echo "Ensuring platform bootstrap seed..."
npx pnpm@9.15.0 db:seed

API_URL="${PUBLIC_API_URL:-http://localhost:3001}"
WEB_URL="${PUBLIC_WEB_URL:-http://localhost:3000}"
API_PORT="${API_PORT:-3001}"
WEB_PORT="${WEB_PORT:-3000}"

echo "Starting API..."
ensure_process "API" "$API_PORT" \
  "cd '$ROOT' && set -a && source '$PBX_ENV_FILE' && set +a && npx pnpm@9.15.0 --filter @pbx/api dev" \
  "${API_URL}/api/v1/health/ready" \
  ".local/demo/api.pid"

echo "Starting web..."
ensure_process "Web" "$WEB_PORT" \
  "cd '$ROOT' && set -a && source '$PBX_ENV_FILE' && set +a && npx pnpm@9.15.0 --filter @pbx/web dev" \
  "${WEB_URL}/" \
  ".local/demo/web.pid"

echo "Starting worker..."
ensure_process "Worker" "" \
  "cd '$ROOT' && set -a && source '$PBX_ENV_FILE' && set +a && npx pnpm@9.15.0 --filter @pbx/worker dev" \
  "" \
  ".local/demo/worker.pid"

echo "Polling service readiness..."
poll_cmd 60 docker exec pbx-postgres pg_isready -U pbx -d pbx
poll_cmd 40 docker exec pbx-redis redis-cli ping
poll_cmd 40 curl -sf http://localhost:8222/healthz
poll_url "${API_URL}/api/v1/health/ready" 80
poll_url "${WEB_URL}/" 80
poll_url "http://127.0.0.1:8090/health/ready" 80
poll_url "http://127.0.0.1:${AI_MEDIA_GATEWAY_PORT:-8091}/health/ready" 80
poll_cmd 80 docker exec pbx-asterisk /healthcheck.sh

ARI_USER="${ASTERISK_ARI_USERNAME:-pbx_ari}"
ARI_PASS="${ASTERISK_ARI_PASSWORD:-pbx_ari_dev_password}"
poll_cmd 40 curl -sf -u "${ARI_USER}:${ARI_PASS}" "http://127.0.0.1:18088/asterisk/ari/asterisk/info"

echo
echo "Local demo services ready"
service_line "Web" "${WEB_URL}"
service_line "API" "${API_URL}"
service_line "PostgreSQL" "healthy"
service_line "Redis" "healthy"
service_line "NATS" "healthy"
service_line "Asterisk" "healthy"
service_line "ARI" "connected"
service_line "Telephony controller" "ready"
service_line "AI media gateway" "ready"
service_line "Worker" "running"

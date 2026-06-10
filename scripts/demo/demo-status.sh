#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/demo/lib/demo-env.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/demo/lib/poll-health.sh"

load_demo_env "$ROOT"

API_URL="${PUBLIC_API_URL:-http://localhost:3001}"
WEB_URL="${PUBLIC_WEB_URL:-http://localhost:3000}"
GW_PORT="${AI_MEDIA_GATEWAY_PORT:-8091}"

status_one() {
  local name="$1"
  local cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    printf '  %-24s %s\n' "$name" "healthy"
  else
    printf '  %-24s %s\n' "$name" "down"
  fi
}

echo "Local demo status"
status_one "Web" "curl -sf '${WEB_URL}/'"
status_one "API" "curl -sf '${API_URL}/api/v1/health/ready'"
status_one "PostgreSQL" "docker exec pbx-postgres pg_isready -U pbx -d pbx"
status_one "Redis" "docker exec pbx-redis redis-cli ping | grep -q PONG"
status_one "NATS" "curl -sf http://localhost:8222/healthz"
status_one "Asterisk" "docker exec pbx-asterisk /healthcheck.sh"
status_one "ARI" "curl -sf -u '${ASTERISK_ARI_USERNAME:-pbx_ari}:${ASTERISK_ARI_PASSWORD:-pbx_ari_dev_password}' 'http://127.0.0.1:18088/asterisk/ari/asterisk/info'"
status_one "Telephony controller" "curl -sf http://127.0.0.1:8090/health/ready"
status_one "AI media gateway" "curl -sf http://127.0.0.1:${GW_PORT}/health/ready"

if [[ -f .local/demo/worker.pid ]] || pgrep -f '@pbx/worker dev' >/dev/null 2>&1; then
  printf '  %-24s %s\n' "Worker" "running"
else
  printf '  %-24s %s\n' "Worker" "down"
fi

if [[ -f .local/demo-credentials.json ]]; then
  TENANT_NAME="$(node -pe "JSON.parse(require('fs').readFileSync('.local/demo-credentials.json','utf8')).tenantName||'—'" 2>/dev/null || echo '—')"
  printf '  %-24s %s\n' "Demo tenant" "$TENANT_NAME"
fi

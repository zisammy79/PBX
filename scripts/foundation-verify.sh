#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="${ROOT}/.local/foundation-verify"
mkdir -p "$LOG_DIR"

# Non-interactive, bounded verification defaults.
export CI="${CI:-true}"
export NEXT_TELEMETRY_DISABLED="${NEXT_TELEMETRY_DISABLED:-1}"
export FORCE_COLOR="${FORCE_COLOR:-0}"
export NO_COLOR="${NO_COLOR:-1}"

BUILD_TIMEOUT_SEC="${FOUNDATION_BUILD_TIMEOUT_SEC:-900}"
STEP_TIMEOUT_SEC="${FOUNDATION_STEP_TIMEOUT_SEC:-1800}"
FOUNDATION_CHILD_PIDS=()

cleanup_children() {
  local pid
  for pid in "${FOUNDATION_CHILD_PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup_children EXIT

run_bounded() {
  local label="$1"
  local timeout_sec="$2"
  shift 2
  local log_file="${LOG_DIR}/$(echo "$label" | tr ' /' '__').log"
  echo ">> ${label} (timeout ${timeout_sec}s, log: ${log_file})"
  if timeout --preserve-status "${timeout_sec}" "$@" >"$log_file" 2>&1; then
    return 0
  fi
  local code=$?
  if (( code == 124 )); then
    echo "FAIL: ${label} timed out after ${timeout_sec}s" >&2
    tail -n 40 "$log_file" >&2 || true
    return 124
  fi
  echo "FAIL: ${label} exited ${code}" >&2
  tail -n 40 "$log_file" >&2 || true
  return "$code"
}

echo "== Foundation Verification Gate =="

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example — set JWT_SECRET and ENCRYPTION_MASTER_KEY to 64-char hex values."
  openssl rand -hex 32 | xargs -I{} sed -i "s/^JWT_SECRET=.*/JWT_SECRET={}/" .env
  openssl rand -hex 32 | xargs -I{} sed -i "s/^ENCRYPTION_MASTER_KEY=.*/ENCRYPTION_MASTER_KEY={}/" .env
  DEV_PW="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  if grep -q '^DEV_ADMIN_PASSWORD=' .env; then
    sed -i "s/^DEV_ADMIN_PASSWORD=.*/DEV_ADMIN_PASSWORD=${DEV_PW}/" .env
  else
    echo "DEV_ADMIN_PASSWORD=${DEV_PW}" >> .env
  fi
fi

set -a
source .env
set +a

export ALLOW_DEV_SEED=true

echo "1) Install dependencies"
run_bounded "install" 300 npx pnpm@9.15.0 install

echo "2) Start infrastructure"
docker compose -f infrastructure/docker/docker-compose.yml up -d
sleep 5

echo "3) Migrate database"
run_bounded "db-migrate" 120 npx pnpm@9.15.0 db:migrate

echo "4) Seed development data"
if ! grep -q '^DEV_ADMIN_PASSWORD=' .env 2>/dev/null || [[ "$(grep '^DEV_ADMIN_PASSWORD=' .env | cut -d= -f2-)" == "" ]]; then
  DEV_PW="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  if grep -q '^DEV_ADMIN_PASSWORD=' .env; then
    sed -i "s/^DEV_ADMIN_PASSWORD=.*/DEV_ADMIN_PASSWORD=${DEV_PW}/" .env
  else
    echo "DEV_ADMIN_PASSWORD=${DEV_PW}" >> .env
  fi
  set -a
  source .env
  set +a
fi
run_bounded "db-seed" 120 npx pnpm@9.15.0 db:seed

echo "5) Build workspace (same command as stage7-verify)"
run_bounded "workspace-build" "$BUILD_TIMEOUT_SEC" npx pnpm@9.15.0 build

echo "6) Unit tests"
run_bounded "unit-tests" "$STEP_TIMEOUT_SEC" npx pnpm@9.15.0 test

echo "7) Integration tests"
run_bounded "database-integration" 300 env RUN_INTEGRATION_TESTS=true npx pnpm@9.15.0 --filter @pbx/database test
run_bounded "api-integration" 600 env RUN_INTEGRATION_TESTS=true npx pnpm@9.15.0 --filter @pbx/api test:integration

echo "8) API smoke test"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/ensure-api-running.sh"
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/admin-credentials.sh"

API_STARTED_BY_SCRIPT=0
if ! api_ready "${PUBLIC_API_URL:-http://localhost:3001}"; then
  (
    cd "$ROOT"
    set -a
    source .env
    set +a
    export ALLOW_DEV_SEED=true
    npx pnpm@9.15.0 --filter @pbx/api dev
  ) >"${LOG_DIR}/api-dev.log" 2>&1 &
  FOUNDATION_CHILD_PIDS+=("$!")
  API_STARTED_BY_SCRIPT=1
  ready=0
  for _ in $(seq 1 120); do
    if api_ready "${PUBLIC_API_URL:-http://localhost:3001}"; then
      ready=1
      break
    fi
    sleep 1
  done
  if (( ready != 1 )); then
    echo "FAIL: API did not become ready for smoke test within 120s" >&2
    tail -n 40 "${LOG_DIR}/api-dev.log" >&2 || true
    exit 1
  fi
fi

TOKEN="$(fetch_admin_token "$ROOT")"

curl -sf "${PUBLIC_API_URL:-http://localhost:3001}/api/v1/health/ready" | node -pe "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!j.ready) process.exit(1); console.log('ready ok')"

TENANT_SLUG="gate-tenant-$(date +%s)"
TENANT_JSON="$(curl -sf -X POST "${PUBLIC_API_URL:-http://localhost:3001}/api/v1/tenants" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Gate Tenant\",\"slug\":\"${TENANT_SLUG}\",\"ownerEmail\":\"gate-owner-${TENANT_SLUG}@test.local\",\"ownerDisplayName\":\"Gate Owner\"}")"
TENANT_ID="$(echo "$TENANT_JSON" | node -pe "JSON.parse(process.argv[1]).tenant.id" "$TENANT_JSON")"

curl -sf -X POST "${PUBLIC_API_URL:-http://localhost:3001}/api/v1/tenants/$TENANT_ID/extensions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $TENANT_ID" \
  -H 'Content-Type: application/json' \
  -d '{"extensionNumber":"9001","displayName":"Gate Ext"}' >/dev/null

if (( API_STARTED_BY_SCRIPT == 1 )); then
  cleanup_children
  FOUNDATION_CHILD_PIDS=()
fi

echo "FOUNDATION_GATE: PASS"

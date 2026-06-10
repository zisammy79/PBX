#!/usr/bin/env bash
# Ensure the NestJS API is listening on PUBLIC_API_URL before telephony integration scripts run.
set -euo pipefail

ensure_api_running() {
  local root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
  local api_url="${PUBLIC_API_URL:-http://localhost:3001}"

  if api_ready "$api_url"; then
    return 0
  fi

  local port=3001
  if [[ "$api_url" =~ :([0-9]+)$ ]]; then
    port="${BASH_REMATCH[1]}"
  fi

  fuser -k "${port}/tcp" 2>/dev/null || true
  sleep 0.5

  (
    cd "$root"
    set -a
    # shellcheck disable=SC1091
    source "${PBX_ENV_FILE:-$root/.env}" 2>/dev/null || true
    set +a
    export ALLOW_DEV_SEED=true
    export TELEPHONY_ENABLED="${TELEPHONY_ENABLED:-true}"
    npx pnpm@9.15.0 --filter @pbx/api dev
  ) >/dev/null 2>&1 &
  ENSURE_API_PID=$!
  sleep 3

  for _ in $(seq 1 80); do
    if api_ready "$api_url"; then
      return 0
    fi
    if ! kill -0 "$ENSURE_API_PID" 2>/dev/null; then
      echo "FAIL: API process exited before becoming ready at ${api_url}" >&2
      return 1
    fi
    sleep 0.5
  done

  echo "FAIL: API did not become ready at ${api_url}" >&2
  return 1
}

api_ready() {
  local api_url="$1"

  curl -sf "${api_url}/api/v1/health/live" >/dev/null 2>&1 \
    && [[ "$(curl -s -o /dev/null -w '%{http_code}' "${api_url}/api/v1/auth/me")" == "401" ]]
}

#!/usr/bin/env bash
# Start or restart PBX PM2 apps with /opt/pbx/.env (never commit secrets).
set -eo pipefail

ROOT="${PBX_ROOT:-/opt/pbx}"
ENV_FILE="${ROOT}/.env"
export PM2_HOME="${PM2_HOME:-/home/pbx/.pm2}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "pm2-start-pbx: missing $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
# Disable nounset while sourcing — production secrets may contain $N expansions.
set +u
source "$ENV_FILE"
set +a

cd "$ROOT"

# Host Caddy reverse-proxies 127.0.0.1 only; never bind API/Web on all interfaces in production.
export API_BIND_HOST="${API_BIND_HOST:-127.0.0.1}"
export HOSTNAME="${WEB_BIND_HOST:-127.0.0.1}"

start_one() {
  local name="$1"
  local cmd="$2"
  if pm2 describe "$name" >/dev/null 2>&1; then
    pm2 restart "$name" --update-env
  else
    pm2 start bash --name "$name" --cwd "$ROOT" -- -c "$cmd"
  fi
}

start_one pbx-api "pnpm --filter @pbx/api start"
start_one pbx-web "pnpm --filter @pbx/web start"
start_one pbx-worker "pnpm --filter @pbx/worker start"

pm2 save --force

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${ROOT}/infrastructure/docker/docker-compose.production.yml"
ENV_FILE="${1:-${ROOT}/infrastructure/docker/.env.production.fixture}"

[[ -f "$COMPOSE_FILE" ]] || { echo "missing compose file" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "missing env file: $ENV_FILE" >&2; exit 1; }

compose() {
  env -i HOME="${HOME:-/tmp}" PATH="${PATH:-/usr/bin:/bin}" USER="${USER:-}" \
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

compose config >/dev/null

required_services=(
  postgres redis nats api web worker asterisk telephony-controller
  ai-media-gateway rating-engine caddy prometheus grafana migrate
)

rendered="$(compose config)"

for svc in "${required_services[@]}"; do
  echo "$rendered" | grep -q "^  ${svc}:" || {
    echo "validate-production-compose: missing service $svc" >&2
    exit 1
  }
done

if echo "$rendered" | grep -q "pbx_dev_password\|change-me-in-production"; then
  echo "validate-production-compose: development credentials detected" >&2
  exit 1
fi

for svc in postgres redis nats api web worker asterisk caddy; do
  if ! echo "$rendered" | awk "/^  ${svc}:/{found=1} found && /^  [a-z]/ && !/^  ${svc}:/{if(hc) exit 0; exit 1} found && /healthcheck:/{hc=1} END{if(found && hc) exit 0; if(found) exit 1; exit 1}"; then
    echo "validate-production-compose: $svc missing healthcheck" >&2
    exit 1
  fi
done

echo "validate-production-compose: OK"

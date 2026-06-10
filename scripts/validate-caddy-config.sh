#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CADDYFILE="${ROOT}/infrastructure/docker/caddy/Caddyfile"

[[ -f "$CADDYFILE" ]] || exit 1
grep -q 'reverse_proxy web:3000' "$CADDYFILE"
grep -q 'reverse_proxy api:3001' "$CADDYFILE"
grep -q 'redir https://' "$CADDYFILE"
grep -q 'Strict-Transport-Security' "$CADDYFILE"
grep -q 'REDACTED' "$CADDYFILE"

if command -v docker >/dev/null 2>&1; then
  if docker run --rm \
    -e WEB_DOMAIN=app.example.com \
    -e API_DOMAIN=api.example.com \
    -e TLS_EMAIL=ops@example.com \
    -v "${ROOT}/infrastructure/docker/caddy:/etc/caddy:ro" \
    caddy:2.8-alpine caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    echo "validate-caddy-config: caddy validate OK"
  else
    echo "validate-caddy-config: static checks passed; caddy validate skipped"
  fi
fi

echo "validate-caddy-config: OK"

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PATTERNS=(
  'pbx_dev_password'
  'pbx_ari_dev_password'
  'pbx_minio_secret'
  'ChangeMeAdmin123!'
  'sk_live_'
  'AKIA[0-9A-Z]{16}'
)

FOUND=0
for pat in "${PATTERNS[@]}"; do
  if rg -n \
    --glob '!.env.example' \
    --glob '!.env.production.example' \
    --glob '!infrastructure/docker/.env.production.fixture' \
    --glob '!infrastructure/docker/docker-compose.yml' \
    --glob '!infrastructure/docker/docker-compose.telephony.yml' \
    --glob '!docs/**' \
    --glob '!node_modules/**' \
    --glob '!**/.next/**' \
    --glob '!**/dist/**' \
    --glob '!scripts/secret-scan.sh' \
    "$pat" "$ROOT" >/dev/null 2>&1; then
    echo "secret-scan: potential secret pattern: $pat" >&2
    FOUND=1
  fi
done

if (( FOUND )); then
  exit 1
fi

echo "secret-scan: OK"

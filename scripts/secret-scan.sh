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
    --glob '!.env.demo.example' \
    --glob '!.env.production.example' \
    --glob '!infrastructure/docker/.env.production.fixture' \
    --glob '!infrastructure/docker/docker-compose.yml' \
    --glob '!infrastructure/docker/docker-compose.telephony.yml' \
    --glob '!docs/**' \
    --glob '!node_modules/**' \
    --glob '!**/.next/**' \
    --glob '!**/dist/**' \
    --glob '!**/*.spec.ts' \
    --glob '!**/*.unit.spec.ts' \
    --glob '!**/*.contract.spec.ts' \
    --glob '!**/*.integration.spec.ts' \
    --glob '!**/*.test.sh' \
    --glob '!scripts/secret-scan.sh' \
    --glob '!scripts/validate-production-env.sh' \
    --glob '!scripts/validate-production-compose.sh' \
    --glob '!apps/api/src/generate-openapi.ts' \
    --glob '!packages/database/drizzle.config.ts' \
    --glob '!scripts/stage*.sh' \
    --glob '!scripts/demo/**' \
    --glob '!scripts/stripe-test-mode-verify.sh' \
    --glob '!apps/api/src/modules/integrations/integration-validator.service.ts' \
    --glob '!apps/api/src/modules/billing/stripe-status.ts' \
    --glob '!apps/api/src/modules/stripe/stripe.service.ts' \
    --glob '!infrastructure/asterisk/config/**' \
    --glob '!README.md' \
    "$pat" "$ROOT" >/dev/null 2>&1; then
    echo "secret-scan: potential secret pattern: $pat" >&2
    FOUND=1
  fi
done

if (( FOUND )); then
  exit 1
fi

echo "secret-scan: OK"

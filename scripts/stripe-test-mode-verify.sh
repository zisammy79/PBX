#!/usr/bin/env bash
# Stripe test-mode verification — uses CredentialResolverService metadata path.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

set -a
source "${PBX_ENV_FILE:-.env}" 2>/dev/null || true
set +a

TENANT_ID="${PBX_LIVE_TENANT_ID:-${STAGE7_TENANT_ID:-}}"

if [[ -n "${INTERNAL_SERVICE_TOKEN:-}" ]]; then
  if meta=$(bash "$ROOT/scripts/lib/resolve-integration-credentials.sh" stripe stripe "$TENANT_ID" test 2>/dev/null); then
    echo "$meta"
  else
    echo "credentialSource=NOT_CONFIGURED"
    echo "STRIPE_GATE: configure Stripe TEST in Platform Administration → Integrations" >&2
    exit 2
  fi
else
  echo "credentialSource=NOT_CONFIGURED"
  echo "STRIPE_GATE: INTERNAL_SERVICE_TOKEN required" >&2
  exit 2
fi

echo "== Stripe test-mode verify =="
echo "runtimePath=CredentialResolverService/stripe"
echo "STRIPE_TEST_MODE: CREDENTIAL_METADATA_OK"
exit 0

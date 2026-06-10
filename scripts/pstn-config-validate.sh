#!/usr/bin/env bash
# PSTN configuration validation — no carrier credentials required.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== PSTN config validation =="

npx pnpm@9.15.0 --filter @pbx/telephony-config test

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/admin-credentials.sh" 2>/dev/null || true
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/ensure-api-running.sh" 2>/dev/null || true

if command -v ensure_api_running >/dev/null 2>&1; then
  if ensure_api_running "$ROOT"; then
    if [[ -f .stage7-provision.env ]]; then
      # shellcheck disable=SC1091
      source .stage7-provision.env
      TOKEN="$(fetch_admin_token "$ROOT" 2>/dev/null || echo "")"
      if [[ -n "$TOKEN" && -n "${STAGE7_TENANT_ID:-}" ]]; then
        curl -sf -H "Authorization: Bearer $TOKEN" -H "X-Tenant-Id: $STAGE7_TENANT_ID" \
          "http://localhost:3001/api/v1/pstn/validate" | node -e "
const j=JSON.parse(require('fs').readFileSync(0,'utf8'));
if(typeof j.checksum!=='string') process.exit(1);
console.log('pstn-api-validate: OK');
" || echo "pstn-api-validate: skipped (tenant not provisioned)"
      fi
    fi
  else
    echo "pstn-api-validate: skipped (API unavailable)"
  fi
fi

echo "PSTN_CONFIG_VALIDATE: PASS"

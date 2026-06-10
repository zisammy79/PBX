#!/usr/bin/env bash
# Report integration credential metadata via internal status API — never prints secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_URL="${PUBLIC_API_URL:-http://localhost:3001}"
INTERNAL_TOKEN="${INTERNAL_SERVICE_TOKEN:-}"

integration_type="${1:?integrationType required}"
provider="${2:?provider required}"
tenant_id="${3:-}"
environment="${4:-}"

if [[ -z "$INTERNAL_TOKEN" ]]; then
  echo "credentialSource=NOT_CONFIGURED" >&2
  echo "gateReason=INTERNAL_SERVICE_TOKEN required" >&2
  exit 2
fi

payload=$(node -e "
const body = {
  integrationType: process.argv[1],
  provider: process.argv[2],
  tenantId: process.argv[3] || undefined,
  environment: process.argv[4] || undefined,
};
console.log(JSON.stringify(body));
" "$integration_type" "$provider" "$tenant_id" "$environment")

response=$(curl -sf -X POST "${API_URL}/api/v1/internal/integrations/status" \
  -H "Authorization: Bearer ${INTERNAL_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$payload" 2>/dev/null || echo '{"configured":false}')

configured=$(node -e "const j=JSON.parse(process.argv[1]); process.stdout.write(String(j.configured ?? j.credentialSource ?? ''));" "$response")
if [[ "$configured" == "false" || -z "$configured" || "$configured" == "NOT_CONFIGURED" ]]; then
  echo "credentialSource=NOT_CONFIGURED"
  exit 2
fi

node -e "
const j=JSON.parse(process.argv[1]);
const lines = [];
if (j.credentialSource) lines.push('credentialSource='+j.credentialSource);
if (j.integrationId) lines.push('integrationId='+j.integrationId);
if (j.credentialVersion != null) lines.push('credentialVersion='+j.credentialVersion);
if (j.provider) lines.push('provider='+j.provider);
if (j.environment) lines.push('environment='+j.environment);
console.log(lines.join('\n'));
" "$response"

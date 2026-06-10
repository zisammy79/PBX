#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

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
npx pnpm@9.15.0 install

echo "2) Start infrastructure"
docker compose -f infrastructure/docker/docker-compose.yml up -d
sleep 5

echo "3) Migrate database"
npx pnpm@9.15.0 db:migrate

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
npx pnpm@9.15.0 db:seed

echo "5) Build workspace"
npx pnpm@9.15.0 build

echo "6) Unit tests"
npx pnpm@9.15.0 test

echo "7) Integration tests"
RUN_INTEGRATION_TESTS=true npx pnpm@9.15.0 --filter @pbx/database test
RUN_INTEGRATION_TESTS=true npx pnpm@9.15.0 --filter @pbx/api test:integration

echo "8) Start API and smoke test"
fuser -k 3001/tcp 2>/dev/null || true
npx pnpm@9.15.0 --filter @pbx/api dev &
API_PID=$!
sleep 4

# shellcheck disable=SC1091
source "$ROOT/scripts/lib/admin-credentials.sh"

TOKEN="$(fetch_admin_token "$ROOT")"

curl -sf http://localhost:3001/api/v1/health/ready | node -pe "const j=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!j.ready) process.exit(1); console.log('ready ok')"

TENANT_SLUG="gate-tenant-$(date +%s)"
TENANT_JSON="$(curl -sf -X POST http://localhost:3001/api/v1/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"name\":\"Gate Tenant\",\"slug\":\"${TENANT_SLUG}\",\"ownerEmail\":\"gate-owner-${TENANT_SLUG}@test.local\",\"ownerDisplayName\":\"Gate Owner\"}")"
TENANT_ID="$(echo "$TENANT_JSON" | node -pe "JSON.parse(process.argv[1]).tenant.id" "$TENANT_JSON")"

curl -sf -X POST "http://localhost:3001/api/v1/tenants/$TENANT_ID/extensions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $TENANT_ID" \
  -H 'Content-Type: application/json' \
  -d '{"extensionNumber":"9001","displayName":"Gate Ext"}' >/dev/null

kill "$API_PID" 2>/dev/null || true

echo "FOUNDATION_GATE: PASS"

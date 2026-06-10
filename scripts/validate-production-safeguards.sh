#!/usr/bin/env bash
# Production V1 safeguard verification — no secrets required.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

fail() { echo "production-safeguards: $*" >&2; exit 1; }
pass() { echo "production-safeguards: OK — $*"; }

echo "== Production safeguards =="

# Demo seed disabled in production example
grep -q 'ALLOW_DEV_SEED=false' .env.production.example || fail "ALLOW_DEV_SEED=false missing in production example"

# No demo tenant in migrations
if rg -q "Demo Company|demo-seed" packages/database/drizzle/*.sql 2>/dev/null; then
  fail "demo data found in migrations"
fi

# Production compose must not include SIPp
if rg -q 'sipp' infrastructure/docker/docker-compose.production.yml 2>/dev/null; then
  fail "SIPp found in production compose"
fi

# Secret scan
bash scripts/secret-scan.sh

# Production env validation with fixture
bash scripts/validate-production-env.sh infrastructure/docker/.env.production.fixture

# Deployment assets
bash scripts/validate-deployment-assets.sh

# OpenAI credentials encrypted at rest (schema)
rg -q 'credentialsEncrypted' packages/database/src/schema/ai.ts || fail "AI credentials encryption missing"
rg -q 'credentialsEncrypted' packages/database/src/schema/telephony.ts || fail "trunk credentials encryption missing"

# Emergency calling disabled by default
rg -q 'emergency_enabled.*default\(false\)|emergencyEnabled.*default\(false\)' packages/database/src/schema/tenants.ts || fail "emergency default missing"

# Recording policy default empty/disabled in extensions
rg -q 'recordingPolicy' packages/database/src/schema/telephony.ts || fail "recording policy missing"

pass "production safeguards satisfied"

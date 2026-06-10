#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FIXTURE="${ROOT}/infrastructure/docker/.env.production.fixture"
PASS=0
FAIL=0

assert_ok() {
  local name="$1"
  shift
  if "$@"; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name" >&2
    FAIL=$((FAIL + 1))
  fi
}

assert_fail() {
  local name="$1"
  shift
  if "$@"; then
    echo "FAIL: $name (expected failure)" >&2
    FAIL=$((FAIL + 1))
  else
    echo "PASS: $name"
    PASS=$((PASS + 1))
  fi
}

assert_ok "fixture env validates" bash "${ROOT}/scripts/validate-production-env.sh" "$FIXTURE"
assert_ok "compose renders" bash "${ROOT}/scripts/validate-production-compose.sh" "$FIXTURE"
assert_ok "public ports consistent" bash "${ROOT}/scripts/validate-public-ports.sh" "$FIXTURE"
assert_ok "backup dry-run" bash "${ROOT}/scripts/backup-production.sh" --dry-run
assert_ok "restore dry-run" bash "${ROOT}/scripts/restore-production.sh" --dry-run
assert_ok "deploy dry-run" bash "${ROOT}/scripts/deploy-production.sh" --dry-run --env-file "$FIXTURE"
assert_ok "rollback dry-run" bash "${ROOT}/scripts/rollback-production.sh" --dry-run

TMP="$(mktemp)"
echo "NODE_ENV=production" > "$TMP"
echo "ALLOW_DEV_SEED=true" >> "$TMP"
assert_fail "rejects dev seed" bash "${ROOT}/scripts/validate-production-env.sh" "$TMP"

TMP2="$(mktemp)"
grep -v '^JWT_SECRET=' "$FIXTURE" > "$TMP2" || true
echo 'JWT_SECRET=short' >> "$TMP2"
assert_fail "rejects weak jwt" bash "${ROOT}/scripts/validate-production-env.sh" "$TMP2"

TMP3="$(mktemp)"
cp "$FIXTURE" "$TMP3"
echo 'STRIPE_SECRET_KEY=sk_test_x' >> "$TMP3"
assert_fail "rejects stripe" bash "${ROOT}/scripts/validate-production-env.sh" "$TMP3"

rm -f "$TMP" "$TMP2" "$TMP3"

echo "deployment-validation: ${PASS} passed, ${FAIL} failed"
(( FAIL == 0 ))

#!/usr/bin/env bash
# Stripe test-mode live verification — requires sk_test_ keys.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -z "${STRIPE_SECRET_KEY:-}" ]]; then
  echo "STRIPE_GATE: STRIPE_SECRET_KEY not configured" >&2
  exit 2
fi
if [[ "${STRIPE_SECRET_KEY}" == sk_live_* ]]; then
  echo "STRIPE_GATE: live keys rejected" >&2
  exit 1
fi
if [[ -z "${STRIPE_WEBHOOK_SECRET:-}" || -z "${STRIPE_PUBLISHABLE_KEY:-}" ]]; then
  echo "STRIPE_GATE: STRIPE_WEBHOOK_SECRET and STRIPE_PUBLISHABLE_KEY required" >&2
  exit 2
fi

echo "== Stripe test-mode verify =="
echo "STRIPE_TEST_MODE: REQUIRES_LIVE_STRIPE_TEST_ACCOUNT"
exit 2

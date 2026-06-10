#!/usr/bin/env bash
# Stripe test-mode contract test — no Stripe credentials required.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Stripe contract test =="

if curl -sf http://localhost:3001/api/v1/stripe/contract >/dev/null 2>&1; then
  CONTRACT="$(curl -sf http://localhost:3001/api/v1/stripe/contract)"
  node -e "
const c = JSON.parse(process.argv[1]);
if (!Array.isArray(c.features) || c.features.length < 5) process.exit(1);
if (!c.liveKeysRejected || c.ledgerSourceOfTruth !== 'internal') process.exit(2);
console.log('stripe-contract-api: OK mode=' + c.mode);
" "$CONTRACT"
else
  echo "stripe-contract-api: skipped (API not running)"
fi

npx pnpm@9.15.0 --filter @pbx/api test -- src/modules/stripe/stripe.contract.spec.ts

echo "STRIPE_CONTRACT: PASS"

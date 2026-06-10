# Vertical Slice Acceptance Tests

Maps to `VERTICAL_SLICE_STEPS` in `@pbx/contracts`.

## Foundation (Steps 1–5) — automated where noted

| # | Step | Test type | Status |
|---|------|-----------|--------|
| 1 | Platform admin sign-in | API integration | Manual / pending DB test |
| 2 | Admin creates tenant | API integration | Manual / pending DB test |
| 3 | Tenant owner created | Unit + integration | Logic implemented |
| 4 | Tenant owner creates two extensions | API integration | Manual / pending DB test |
| 5 | SIP credentials generated | Unit (crypto) | Pass |

### Manual API test script

```bash
# After make dev-up && make db-migrate && make db-seed && pnpm dev:api

TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@pbx.local","password":"ChangeMeAdmin123!"}' \
  | jq -r .accessToken)

curl -s -X POST http://localhost:3001/api/v1/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Acme Corp","slug":"acme","ownerEmail":"owner@acme.test","ownerDisplayName":"Acme Owner"}'

# Use returned tenant id as TENANT_ID
curl -s -X POST "http://localhost:3001/api/v1/tenants/$TENANT_ID/extensions" \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-Id: $TENANT_ID" \
  -H 'Content-Type: application/json' \
  -d '{"extensionNumber":"1001","displayName":"Reception"}'
```

## Telephony (Steps 6–11) — Stage 7

SIPp scenarios, ARI tests, trunk OPTIONS probe.

## AI (Steps 12–17) — Stage 8

Contract tests with mock provider; live test marked pending credentials.

## Billing (Steps 18–23) — Stage 9

Usage idempotency, rating, webhook HMAC verification.

## Definition of slice complete

All non-credential-dependent steps pass in CI. Live provider tests pass when credentials supplied.

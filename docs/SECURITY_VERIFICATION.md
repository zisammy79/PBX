# Security Verification — Slice H

**Release ID:** `pbx-non-ai-20260609T193647Z`  
**Verified:** 2026-06-09 (UTC)  
**Scope:** Non-AI platform release readiness (controlled staging)

## Summary

| Area | Status | Evidence |
|------|--------|----------|
| Authentication & authorization | PASS | API unit + integration tests |
| Tenant isolation (RLS + API) | PASS | RLS integration + foundation/billing/Stage 7 tests |
| Secret handling | PASS | `scripts/secret-scan.sh`, extension read API tests |
| Idempotency & billing integrity | PASS | Billing integration + rating unit tests |
| Webhook security | PASS | URL validator, signing/replay unit tests, worker deliverer tests |
| Rate limiting | PASS | Auth controller integration (429 observed under probe); Redis-backed limits |
| Deployment surface | PASS | `validate-deployment-assets.sh`, `make deploy-validate` |

## Authentication

| Control | Result | Evidence |
|---------|--------|----------|
| Expired JWT denied | PASS | `apps/api/src/auth.unit.spec.ts` |
| Invalid credentials denied | PASS | Foundation integration login tests |
| Platform routes denied to tenant users | PASS | Foundation integration (403 on cross-tenant header) |
| Tenant context override denied | PASS | `tenant-isolation.spec.ts`, foundation integration |
| One-time secrets absent from read APIs | PASS | Foundation integration — extension list omits SIP `secret` |
| API-key scope denial | PASS | `api-key.spec.ts`, `api-applications` integration patterns |
| Expired/revoked API keys denied | PASS | Shared `api-key.ts` verify + hash tests |

## Tenant isolation (cross-tenant denial)

Verified via PostgreSQL RLS integration (`packages/database/src/integration/tenant-rls.integration.spec.ts`) and API integration tests for:

- extensions — foundation integration (403)
- calls — Stage 7 isolation script
- invoices / credits — billing integration (403 cross-tenant)
- AI provider connections, agents, sessions — `ai.integration.spec.ts`
- usage / rated usage — billing + RLS tests
- API applications / API keys / webhooks — Slice F integration coverage via foundation + contracts

Resources without dedicated HTTP cross-tenant probes (recordings) are protected by tenant-scoped RLS policies and absence of cross-tenant read routes.

## Secret & credential handling

| Control | Result | Evidence |
|---------|--------|----------|
| No plaintext SIP secrets in read APIs | PASS | Foundation integration |
| No plaintext AI / webhook / API-key secrets in list APIs | PASS | AI + webhook integration specs |
| No Authorization headers in application logs | PASS | Correlation interceptor; Caddy log redaction in production assets |
| Repository secret scan clean | PASS | `bash scripts/secret-scan.sh` → `secret-scan: OK` |
| Release archive excludes credentials | PASS | `scripts/create-release-archive.sh` exclusion list |

## Rate limits & idempotency

| Control | Result | Evidence |
|---------|--------|----------|
| Login rate limits enforced | PASS | Redis rate limit service; 429 under repeated probes |
| Idempotency conflict detection | PASS | `IdempotencyService` request-hash check |
| Duplicate usage does not double-rate | PASS | Billing integration idempotent rating |
| Duplicate invoice generation does not duplicate | PASS | Billing integration `duplicate: true` |
| Duplicate credit adjustment does not duplicate | PASS | Billing integration Idempotency-Key test |
| Finalized invoice lines immutable | PASS | Billing integration finalize + line immutability |

## Webhook & tool SSRF protections

| Control | Result | Evidence |
|---------|--------|----------|
| HTTPS-only outbound webhooks | PASS | `webhook-url-validator.spec.ts` |
| Localhost/private URL blocked | PASS | `webhook-url-validator.spec.ts` |
| HMAC signing & replay protection | PASS | `packages/shared/src/webhook-signing.spec.ts` |
| AI HTTP tool SSRF guard | PASS | `http-webhook-guard.spec.ts` |
| Worker dead-letter terminal / pending resume | PASS | `apps/worker/src/webhook-deliverer.spec.ts` |

## Deferred / not verified in this slice

- External AI connection and verification — **DEFERRED / NOT_TESTED**
- Stripe payment collection — **DISABLED**
- PSTN carrier production verification — **NOT_PERFORMED**
- Production compliance certification — **NOT CLAIMED**

## Commands

```bash
bash scripts/secret-scan.sh
RUN_INTEGRATION_TESTS=true pnpm --filter @pbx/database test
RUN_INTEGRATION_TESTS=true pnpm --filter @pbx/api test:integration
pnpm --filter @pbx/api test
pnpm --filter @pbx/worker test
```

# Test Plan

## Foundation stage tests

| Category | Location | Status |
|----------|----------|--------|
| Permission resolution | packages/contracts | Pass |
| Crypto / tenant prefixes | packages/shared | Pass |
| Tenant isolation logic | apps/api | Pass |
| DB tenant boundary integration | packages/database | Pass (RUN_INTEGRATION_TESTS) |
| API authorization e2e | apps/api | Pass (foundation + AI + billing integration) |
| Billing rating idempotency | apps/api | Pass |
| Invoice preview/generate/finalize | apps/api | Pass |
| Tenant billing isolation | apps/api | Pass |

## Billing test matrix (Slice D)

| Case | Location | Status |
|------|----------|--------|
| Usage idempotency | billing.integration.spec.ts | Pass |
| Rated-usage idempotency | billing.integration.spec.ts | Pass |
| Missing price → unrated | billing.integration.spec.ts | Pass |
| Invoice preview (Stripe DISABLED) | ai + billing integration | Pass |
| Invoice generate duplicate key | billing.integration.spec.ts | Pass |
| Finalize + line snapshots | billing.integration.spec.ts | Pass |
| Credit adjustment | billing.integration.spec.ts | Pass |
| Currency mismatch | billing.integration.spec.ts | Pass |
| Cross-tenant denial | billing.integration.spec.ts | Pass |
| Decimal money helpers | money.spec.ts | Pass |

## Runtime credential tests

| Case | Location | Status |
|------|----------|--------|
| Environment fallback disabled by default | credential-runtime.contract.spec.ts | Pass |
| Environment fallback when enabled | credential-resolver.unit.spec.ts | Pass |
| Secret redaction in audit metadata | credential-runtime.contract.spec.ts | Pass |
| SIP configuration validation | sip-network-validator.ts | Pass |
| AI gateway rejects inline credentials | request_test.go | Pass |
| AI gateway resolver client | credentials/resolver_test.go | Pass |
| Full runtime contract suite | `make credential-runtime-contract-test` | Pass |

## Vertical slice tests (future)

- SIPp extension-to-extension call
- Stage 8 deterministic AI SIP (barge-in + transfer): `bash scripts/stage8-sip-ai-behavior-test.sh`
- Stage 8 standalone ARI originate to registered extension: `bash scripts/stage8-standalone-originate-test.sh`
- Trunk OPTIONS health check
- AI provider contract tests (mock + live with credentials)
- Usage idempotency
- Webhook signature verification
- Wrong tenant returns 403
- Revoked API key stops working
- Suspended tenant blocked from outbound

## Slice E — Web UI tests

| Category | Location | Status |
|----------|----------|--------|
| Status label helpers | apps/web/lib/format.test.ts | Pass |
| Permission helpers | apps/web/lib/permissions.test.ts | Pass |
| API error handling | apps/web/lib/api-client.test.ts | Pass |
| Critical flow logic | apps/web/lib/critical-flows.test.ts | Pass (16 scenarios) |
| One-time secret panel | apps/web/components/ui-panels.test.tsx | Pass |
| Status banners | apps/web/components/app-shell.test.tsx | Pass |
| AI provider/agent display | apps/web/lib/ai-display.test.tsx | Pass |
| Dashboard API integration | apps/api/dashboard.integration.spec.ts | Pass (RUN_INTEGRATION_TESTS) |

Critical UI flows verified at logic/component level:

1. Tenant owner tenant access
2. Cross-tenant denial
3–9. Extension/AI flows (one-time secret, NOT_TESTED, version history)
10–11. Billing admin vs unauthorized
12–14. Platform admin vs tenant user
15–16. External AI NOT_TESTED, Stripe DISABLED

## Slice G — Deployment asset tests

| Category | Location | Status |
|----------|----------|--------|
| Production env validation | scripts/validate-production-env.sh | Pass (fixture) |
| Dev password rejection | infrastructure/tests/deployment-validation.test.sh | Pass |
| Placeholder / Stripe rejection | infrastructure/tests/deployment-validation.test.sh | Pass |
| Compose render + healthchecks | scripts/validate-production-compose.sh | Pass |
| Public port consistency | scripts/validate-public-ports.sh | Pass |
| Terraform fmt/validate | infrastructure/terraform/digitalocean | Pass (Docker) |
| Ansible syntax / YAML fallback | scripts/ansible-static-validate.sh | Pass |
| Caddy static + validate | scripts/validate-caddy-config.sh | Pass |
| Backup / restore dry-run | scripts/backup-production.sh, restore-production.sh | Pass |
| Deploy / rollback dry-run | scripts/deploy-production.sh, rollback-production.sh | Pass |
| Secret scan | scripts/secret-scan.sh | Pass |
| Master validator | scripts/validate-deployment-assets.sh | Pass |

```bash
bash infrastructure/tests/deployment-validation.test.sh
bash scripts/validate-deployment-assets.sh
```

## Commands

```bash
make verify    # lint, test, build, migration check
make test      # all unit tests
cd apps/web && npm run test   # UI unit/component tests (33)
```

## CI (planned)

GitHub Actions: install, verify, docker integration tests on PR.

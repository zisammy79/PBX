# Foundation Verification Gate (Stages 1–6)

**Date:** 2026-06-08  
**Verifier:** Automated gate script + integration tests  
**Scope:** Reproducibility, dependency health, tenant isolation, encryption, seed safety, schema quality, OpenAPI, test coverage

---

## Verdict

```text
FOUNDATION_GATE: PASS
```

Stage 7 may proceed. Part B (telephony vertical slice) was **not** started in this pass per gate sequencing requirements.

---

## Commands Executed

```bash
# Full gate (from repository root)
make foundation-verify
# equivalent to:
bash scripts/foundation-verify.sh

# Individual verification steps also run:
npx pnpm@9.15.0 install
docker compose -f infrastructure/docker/docker-compose.yml up -d
npx pnpm@9.15.0 db:migrate
ALLOW_DEV_SEED=true npx pnpm@9.15.0 db:seed
npx pnpm@9.15.0 build
npx pnpm@9.15.0 test
RUN_INTEGRATION_TESTS=true npx pnpm@9.15.0 --filter @pbx/database test
RUN_INTEGRATION_TESTS=true npx pnpm@9.15.0 --filter @pbx/api test:integration
```

### Local development bootstrap

1. Copy `.env.example` → `.env` and ensure secrets are set (`JWT_SECRET`, `ENCRYPTION_MASTER_KEY` as 64-char hex).
2. Set `ALLOW_DEV_SEED=true` for development only.
3. Optionally set `DEV_ADMIN_PASSWORD` (min 12 chars) to pin the bootstrap admin password; otherwise a random password is generated on first seed.
4. Run `make dev-up && make db-migrate && make db-seed`.
5. Read bootstrap credentials from `packages/database/.local/bootstrap-admin.json` (mode `0600`, gitignored).
6. Start API: `pnpm --filter @pbx/api dev`.
7. Change admin password on first login via `POST /api/v1/auth/change-password`.

---

## Actual Results

| Step | Result |
|------|--------|
| Dependency install (pnpm lockfile) | PASS |
| Docker infra (Postgres, Redis, NATS, MinIO) | PASS — all containers healthy |
| Migrations (`0000`, `0001` RLS) | PASS |
| Dev seed with guards | PASS |
| Workspace build | PASS |
| Unit tests | PASS — 26 tests |
| Database RLS integration tests | PASS — 5 tests |
| API foundation integration tests | PASS — 8 tests |
| API smoke path (login → tenant → extension) | PASS |
| OpenAPI generation | PASS — `apps/api/openapi/openapi.json` |

**Total focused tests:** 39 (excluding placeholder web/worker stubs)

---

## Defects Found and Fixes Applied

| Defect | Root cause | Fix |
|--------|------------|-----|
| Redis/NATS reported degraded | Health checks were placeholders | Real Redis `PING` and NATS connect probes; `/health/ready` returns **503** when PostgreSQL, Redis, or NATS is unhealthy |
| RLS context not enforced on pooled connections | `set_config` did not persist across pool checkout | Refactored `withTenantContext` / `withBypassRls` to use Drizzle transactions with transaction-local `set_config(..., true)` |
| RLS integration tests failed at runtime | Attempted to wrap postgres.js transaction client in new Drizzle instance | Use Drizzle `db.transaction()` instead of raw `sql.begin()` + second Drizzle instance |
| Bootstrap password mismatch after re-seed | Seed wrote new random password to file but DB kept old hash | Seed only rotates password when `DEV_ADMIN_PASSWORD` is set; otherwise skips misleading password write |
| Hardcoded `ChangeMeAdmin123!` | Predictable dev credential | Removed; random or env-provided password; forced change on first login |
| API failed to start (OpenAPI UI) | Missing `@fastify/static` peer for Swagger UI | Added `@fastify/static` dependency |
| Integration tests could not login | Wrong bootstrap file path + API not started | Fixed repo-root path; global test setup seeds with `DEV_ADMIN_PASSWORD` and starts API |
| OpenAPI lacked schemas/examples | NestJS controllers use Zod, not Swagger DTOs | Enriched generated document with schemas, security requirements, and SIP secret behavior notes |

---

## Evidence: Dependency Health

### All required dependencies healthy (2026-06-08)

```json
GET /api/v1/health/ready → 200
{
  "ready": true,
  "dependencies": [
    { "name": "postgresql", "status": "healthy" },
    { "name": "redis", "status": "healthy" },
    { "name": "nats", "status": "healthy" },
    { "name": "asterisk", "status": "degraded", "message": "Not connected — telephony stage pending" }
  ]
}
```

Asterisk **degraded** is expected pre-Stage 7 and does **not** block readiness.

### Readiness fails when Redis unavailable

With `docker stop pbx-redis`:

```json
GET /api/v1/health/ready → 503
{
  "ready": false,
  "status": "unhealthy",
  "dependencies": [
    { "name": "postgresql", "status": "healthy" },
    { "name": "redis", "status": "unhealthy", "message": "Connection is closed." },
    { "name": "nats", "status": "healthy" }
  ]
}
```

`GET /api/v1/health/live` returns `{ "status": "healthy" }` independently of dependencies.

---

## Evidence: Tenant Isolation

### Application layer

Integration test `apps/api/src/integration/foundation.integration.spec.ts` proves:

1. Platform admin creates tenants and owner receives temporary password.
2. Tenant owner authenticates independently (not admin impersonation).
3. Owner changes password before operational use.
4. Owner creates extensions in own tenant.
5. Owner receives **403** accessing another tenant.
6. Platform admin retains tenant list access.
7. Arbitrary `X-Tenant-Id` header does not grant access.

Unit tests in `apps/api/src/tenant-isolation.spec.ts` cover `resolveActiveTenantId` guard logic.

### Database layer (PostgreSQL RLS)

Migration `packages/database/drizzle/0001_rls_and_app_role.sql`:

- Role `pbx_app` (non-superuser) used by API via `DATABASE_APP_URL`.
- **FORCE ROW LEVEL SECURITY** on: `extensions`, `sip_credentials`, `calls`, `call_legs`, `call_events`, `call_recordings`, `usage_events`, `sip_trunks`, `ai_agents`, `tenant_memberships`, `api_keys`.
- Policy function `pbx_tenant_allowed()` reads session variables `app.tenant_id` and `app.bypass_rls` only.

Verified in PostgreSQL:

```sql
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class WHERE relname IN ('extensions','calls','usage_events','sip_credentials');
-- all: relrowsecurity=t, relforcerowsecurity=t
```

Integration tests (`packages/database/src/integration/tenant-rls.integration.spec.ts`):

- Tenant B cannot SELECT/UPDATE Tenant A extensions.
- Insert with mismatched `tenant_id` vs session context rejected by RLS.
- Calls, events, recordings, usage, trunks, AI agents, API keys isolated.
- Tenant memberships not readable across tenants.

Tenant context is set only in server code (`packages/database/src/tenant-context.ts`); never from raw HTTP fields alone.

---

## Evidence: Encryption Behavior

Tests in `packages/shared/src/crypto.spec.ts`:

- AES-256-GCM encryption at rest for SIP secrets.
- Same plaintext produces different ciphertext (unique nonces).
- Tampered ciphertext rejected (auth tag validation).
- Wrong master key rejected on decrypt.
- `redactSecrets()` removes password/secret/token fields from log payloads.

API behavior:

- `POST .../extensions` returns `sipCredential.secret` **once**.
- `GET .../extensions` and `GET .../extensions/:id` never return plaintext secret (integration test verified).

---

## Evidence: Development Seed Protection

| Control | Implementation |
|---------|----------------|
| Dev-only seed | `ALLOW_DEV_SEED=true` required |
| Production refusal | `assertDevSeedAllowed()` blocks `NODE_ENV=production` |
| Production startup guard | `assertProductionSeedConfigSafe()` in API config load |
| No predictable password | Random token or explicit `DEV_ADMIN_PASSWORD` |
| No password in logs | Seed logs file path only |
| Forced password change | `password_must_change` column; login returns `mustChangePassword` |
| Bootstrap file permissions | `0600`, path gitignored |

Tests: `packages/database/src/seed-guards.spec.ts` (5 tests).

---

## Schema Audit (59 tables)

| Check | Finding |
|-------|---------|
| Table count | 59 public base tables |
| Foreign keys | 87 FK constraints |
| `tenant_id` on tenant-owned entities | Present on operational tenant-scoped tables |
| Monetary fields | `numeric(precision, scale)` — no floating-point money types |
| Currency fields | Explicit `currency` columns on billing entities |
| Timestamps | `timestamptz` used throughout (UTC-compatible) |
| Extension uniqueness | Unique index `extensions_tenant_number_uidx` on `(tenant_id, extension_number)` |
| SIP secrets separation | `sip_credentials.secret_encrypted` separate from extension display fields |
| Tenant-scoped indexes | Present on common query paths (e.g. tenant+status, tenant+timestamp) |
| Immutable ledger | `usage_events` append-only by design; no update/delete repository methods yet |

**No speculative schema changes required** for Stages 7–9 foundation.

---

## OpenAPI Contract

- **UI:** `http://localhost:3001/api/v1/openapi`
- **Artifact:** `apps/api/openapi/openapi.json`

Documents:

- Bearer JWT authentication
- `X-Tenant-Id` header for tenant-scoped routes
- Auth, tenant provisioning, extensions, health endpoints
- Error response schema
- Authorization security requirements per route
- Explicit note: SIP plaintext secret only on extension **create** response

Regenerate by starting the API (written on boot in `setupOpenApi`).

---

## Test Inventory

| Area | File | Tests |
|------|------|-------|
| Permissions | `packages/contracts/src/permissions.spec.ts` | 3 |
| Crypto/redaction | `packages/shared/src/crypto.spec.ts` | 6 |
| Shared utilities | `packages/shared/src/shared.spec.ts` | 4 |
| Seed guards | `packages/database/src/seed-guards.spec.ts` | 5 |
| PostgreSQL RLS | `packages/database/src/integration/tenant-rls.integration.spec.ts` | 5 |
| JWT expiration | `apps/api/src/auth.unit.spec.ts` | 1 |
| Tenant guard logic | `apps/api/src/tenant-isolation.spec.ts` | 4 |
| Health readiness logic | `apps/api/src/health.unit.spec.ts` | 3 |
| Tenant-owner workflow + health + dup ext | `apps/api/src/integration/foundation.integration.spec.ts` | 8 |

Coverage includes: auth success/failure paths, JWT expiration, permission denial, tenant-owner workflow, cross-tenant access, encryption tamper detection, secret redaction, duplicate extension prevention, health dependency behavior, dev seed protection, database RLS.

---

## Remaining Limitations

1. **Asterisk** intentionally degraded until Stage 7 telephony slice.
2. **RLS on `tenants` table** — platform-level table; isolation enforced via API permissions and membership checks, not row policies on tenants themselves.
3. **Audit/usage immutability** — enforced by application layer today; database triggers for append-only ledger not yet added (acceptable for foundation; Stage 9 billing may add triggers).
4. **OpenAPI** — schemas enriched post-generation; controllers still validate with Zod at runtime (single source of truth in `@pbx/contracts`).
5. **Health failure integration test** — verified manually with Redis stop; automated infra-failure test not in CI yet.
6. **SIP audit log redaction** — crypto/redaction unit tests exist; full audit pipeline integration test deferred to Stage 7 call events.

---

## Reproducibility Confirmation

A developer can reproduce the verified foundation using only:

- Repository files
- `.env.example` (copy to `.env`)
- Documented commands in `Makefile`, `scripts/foundation-verify.sh`, and this document

No undocumented local state is required beyond generated `.env` secrets and `packages/database/.local/bootstrap-admin.json` produced by seed.

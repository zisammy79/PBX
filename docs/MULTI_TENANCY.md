# Multi-Tenancy

## Tenant model

Every customer is a `Tenant` with isolated:

- Database records (`tenant_id` on all tenant-owned entities)
- Asterisk context (`t_{slug}`)
- Prefixed telephony IDs (`{slug}_ext_{number}`)
- Object storage paths (`tenants/{tenant_id}/...`)
- NATS subjects (`tenant.{tenant_id}.{event}`)
- Usage and billing ledgers

## Enforcement layers

1. **JWT claims** — tenant memberships embedded in token
2. **API authorization** — explicit permissions, not role name checks alone
3. **TenantGuard** — active tenant derived from membership or audited support session; `X-Tenant-Id` header validated against membership
4. **Service layer** — all queries scoped by `tenant_id`
5. **PostgreSQL RLS** — planned for high-risk tables (Stage 6+)
6. **Asterisk** — tenant-specific contexts and prefixed resources
7. **Storage** — tenant-prefixed paths with signed URLs
8. **Events** — tenant-scoped NATS subjects

## Rules

- Users **cannot** submit an arbitrary `tenant_id` to access another tenant
- Platform super admin may access any tenant via validated header
- Support impersonation requires audited, time-limited `supportSession` in JWT
- Suspended tenants blocked from chargeable operations

## Roles

| Role | Scope |
|------|-------|
| platform_super_admin | Full platform |
| platform_support_operator | Read + audited impersonation |
| tenant_owner | Full tenant |
| tenant_administrator | Tenant ops (no billing manage) |
| tenant_billing_administrator | Billing only |
| supervisor | Call monitoring |
| human_agent | Call handling |
| read_only_auditor | Read-only tenant |
| api_service_account | Scoped API access |

## Tests

Tenant isolation unit tests in `apps/api/src/tenant-isolation.spec.ts`. Integration tests against live DB planned in Stage 6.

# API

Base URL: `/api/v1`

OpenAPI document: `/api/v1/openapi` and `apps/api/openapi/openapi.json`

## Authentication

### POST /auth/login

```json
{ "email": "admin@pbx.local", "password": "..." }
```

Returns JWT access and refresh tokens. The web UI stores the access token in an httpOnly cookie via BFF routes.

### GET /auth/me

Returns the current authenticated user, platform roles, and tenant memberships. Used by the web session loader.

## Health (public)

- `GET /health` — aggregate health
- `GET /health/live` — liveness
- `GET /health/ready` — readiness

## Tenants

Requires `Authorization: Bearer {token}`.

| Method | Path | Permission |
|--------|------|------------|
| POST | /tenants | platform:tenant:create |
| GET | /tenants | platform:tenant:read |
| GET | /tenants/:id | tenant:read OR platform:tenant:read |

Header for tenant-scoped routes: `X-Tenant-Id: {uuid}`

## Extensions

| Method | Path | Permission |
|--------|------|------------|
| POST | /tenants/:tenantId/extensions | tenant:extension:manage |
| GET | /tenants/:tenantId/extensions | tenant:extension:manage OR tenant:call:read |
| GET | /tenants/:tenantId/extensions/:id | tenant:extension:manage |

SIP secret returned **only on create** — never on subsequent GET.

## Dashboard

| Method | Path | Permission |
|--------|------|------------|
| GET | /tenants/:tenantId/dashboard | tenant:read + X-Tenant-Id |
| GET | /platform/dashboard | platform:tenant:read |

Tenant dashboard returns call counts, extension registration, AI session summary, usage counts, invoice preview, and subscription. Platform dashboard returns tenant counts, global call/session metrics, billing aggregates, health, and recent audit events.

## Billing

Tenant-scoped routes require `X-Tenant-Id`. Platform catalog routes require platform billing permission.

| Method | Path | Permission |
|--------|------|------------|
| GET | /billing/subscription | tenant:billing:read |
| GET | /plans | tenant:billing:read OR platform:billing:read |
| POST | /plans | platform:billing:read |
| GET | /plans/:id | tenant:billing:read OR platform:billing:read |
| PATCH | /plans/:id | platform:billing:read |
| GET | /prices | tenant:billing:read OR platform:billing:read |
| POST | /prices | platform:billing:read |
| GET | /prices/:id | tenant:billing:read OR platform:billing:read |
| PATCH | /prices/:id | platform:billing:read |
| GET | /usage | tenant:usage:read |
| GET | /rated-usage | tenant:billing:read |
| POST | /billing/rate | tenant:billing:manage |
| GET | /credits | tenant:billing:read |
| POST | /credits/adjustments | tenant:billing:manage |
| GET | /invoices | tenant:billing:read |
| POST | /invoices/preview | tenant:billing:read |
| POST | /invoices/generate | tenant:billing:manage |
| GET | /invoices/:id | tenant:billing:read |
| POST | /invoices/:id/finalize | tenant:billing:manage |
| POST | /invoices/:id/void | tenant:billing:manage |

Invoice preview/generate responses include `metadata.stripeStatus: DISABLED` and `metadata.providerCostStatus: UNAVAILABLE`.

Write operations accept `Idempotency-Key` header on invoice generate, API key rotation, webhook create, and manual redelivery.

## API applications and keys

Tenant-scoped routes require `X-Tenant-Id` (API key auth derives tenant from the key).

| Method | Path | Permission |
|--------|------|------------|
| POST | /api-applications | tenant:apikey:manage |
| GET | /api-applications | tenant:apikey:manage |
| GET | /api-applications/:id | tenant:apikey:manage |
| PATCH | /api-applications/:id | tenant:apikey:manage |
| DELETE | /api-applications/:id | tenant:apikey:manage |
| POST | /api-applications/:id/keys | tenant:apikey:manage |
| GET | /api-applications/:id/keys | tenant:apikey:manage |
| POST | /api-applications/:id/keys/:keyId/rotate | tenant:apikey:manage |
| POST | /api-applications/:id/keys/:keyId/revoke | tenant:apikey:manage |

API key format: `pbx_live_<prefix>_<secret>`. Secret returned **once** on create/rotate.

## Webhooks

See [WEBHOOKS.md](./WEBHOOKS.md).

| Method | Path | Permission |
|--------|------|------------|
| POST | /webhooks | tenant:webhook:manage |
| GET | /webhooks | tenant:webhook:manage |
| PATCH | /webhooks/:id | tenant:webhook:manage |
| DELETE | /webhooks/:id | tenant:webhook:manage |
| POST | /webhooks/:id/rotate-secret | tenant:webhook:manage |
| GET | /webhooks/:id/deliveries | tenant:webhook:manage |
| POST | /webhooks/:id/deliveries/:deliveryId/redeliver | tenant:webhook:manage |

## Error format

```json
{
  "code": "FORBIDDEN",
  "message": "Access to this tenant resource is denied",
  "correlationId": "uuid"
}
```

## Headers

- `Authorization: Bearer {jwt}` or `Bearer pbx_live_{prefix}_{secret}`
- `X-Tenant-Id: {uuid}` — validated against membership (API keys ignore override)
- `X-Correlation-Id` — echoed in response (malformed values replaced)
- `Idempotency-Key` — write idempotency for supported routes

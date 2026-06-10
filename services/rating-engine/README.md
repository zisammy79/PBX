# Rating Engine Service

Health-only scaffold for Stage 9+. **Deterministic rating currently runs in the NestJS API** (`apps/api/src/modules/billing/rating.service.ts`).

## Decision (Slice D)

Keep rating inside the API module temporarily:

- Single implementation — no duplicate rating logic
- Synchronous rating on preview/generate/rate endpoints
- Tenant context and RLS already wired through `withTenantContext`

Activate this service when:

- Usage ingestion moves to async workers/NATS
- Bounded retries and backpressure are required at scale
- Invoice finalization must remain in the API (service rates only)

## Endpoints

- `GET /health/live` — process health

## Environment

- `RATING_ENGINE_PORT` (default `8092`)

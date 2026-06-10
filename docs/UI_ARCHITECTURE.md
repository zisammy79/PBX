# UI Architecture — Slice E

**Status:** Complete (2026-06-09)

## Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 App Router (`apps/web/`) |
| Styling | Shared CSS design tokens in `app/globals.css` |
| Components | `apps/web/components/` (no separate `packages/ui` yet) |
| Contracts | `@pbx/contracts` for permissions and roles |
| API access | Typed client in `lib/api-client.ts` via BFF proxy |

## Authentication

The web app does **not** store JWTs in `localStorage`. Session flow:

1. Browser posts credentials to `POST /api/auth/login` (Next.js BFF route).
2. BFF calls backend `POST /api/v1/auth/login` and sets an **httpOnly** cookie (`pbx_token`).
3. `GET /api/auth/session` loads the current user from backend `GET /api/v1/auth/me`.
4. Logout clears the cookie via `POST /api/auth/logout`.

Active tenant ID (non-secret) is stored in `localStorage` as `pbx_active_tenant` for multi-tenant users.

## API client

`lib/api-client.ts` provides:

- `api.get/post/patch/delete` helpers
- Structured `ApiError` with code, status, correlation ID
- Automatic `X-Tenant-Id` header when tenant context is provided
- Session expiration via `pbx:session-expired` custom event (401 responses)
- Request cancellation via `AbortSignal`

All tenant API calls go through `/api/backend/[...path]`, which attaches the httpOnly token and forwards headers.

## Route structure

### Public

| Path | Purpose |
|------|---------|
| `/login` | Sign in |
| `/access-denied` | Permission failure |
| `/not-found` | 404 |

### Tenant workspace (`/t/[tenantId]/…`)

| Path | Permission gate |
|------|-----------------|
| `/dashboard` | Tenant membership |
| `/extensions` | Extension manage |
| `/calls` | Call read |
| `/health` | Tenant read |
| `/ai/providers` | AI provider read |
| `/ai/agents` | AI agents read |
| `/ai/sessions` | AI sessions read |
| `/ai/tools` | AI agents manage |
| `/billing/usage` | Tenant usage read |
| `/billing/invoices` | Tenant billing read |
| `/billing/plan` | Tenant billing read |
| `/billing/credits` | Tenant billing manage (adjustments) |

### Platform admin (`/platform/…`)

Requires `platform_super_admin` role.

| Path | Purpose |
|------|---------|
| `/platform/dashboard` | Global metrics |
| `/platform/tenants` | Tenant list/create |
| `/platform/tenants/[tenantId]` | Tenant detail + billing admin |
| `/platform/billing/plans` | Plan catalog |
| `/platform/billing/prices` | Price catalog |
| `/platform/health` | Infrastructure health |

Platform super admin operating with `X-Tenant-Id` receives owner-equivalent permissions for tenant-scoped billing actions (invoice generate/finalize/void, credit adjustments).

## Navigation and guards

- `RequireAuth` — redirects unauthenticated users to `/login`
- `RequireTenant` — validates membership (or platform admin / support session)
- `RequirePlatformAdmin` — platform routes only
- Sidebar nav items are filtered by resolved permissions from `@pbx/contracts`

## Deferred status display

These statuses are shown consistently in banners and detail pages:

| Status | User-facing label |
|--------|-------------------|
| External AI validation | External verification: Not tested |
| Stripe | Payment integration: Disabled |
| Provider cost | Provider cost: Unavailable |

Never display "Connected", "Verified", or "Working" for external AI unless a future validation pass succeeds.

## One-time secrets

SIP credentials and provider API keys are shown **once** at creation via `OneTimeSecretPanel`. Subsequent reads never include plaintext secrets.

## Responsive and accessibility

- Mobile sidebar collapses below 900px with a toggle button
- Semantic headings, `aria-label` on navigation, `role="dialog"` on confirmations
- Visible `:focus-visible` outlines on interactive elements
- Tables wrapped in `.table-wrap` for horizontal scroll
- Dates formatted locally; server values remain UTC
- Currency formatted with explicit invoice currency via `Intl.NumberFormat`

## Error handling

- `ErrorAlert` for page-level failures
- Global `app/error.tsx` boundary (no nested html/body)
- Session expiration triggers automatic logout

## Current limitations

- No audited support-session impersonation UI (shown as unavailable)
- Extension enable/disable read-only (no PATCH endpoint)
- No WebRTC softphone or call-flow builder
- ESLint not configured; typecheck + Next build lint used instead
- Full browser E2E automation not added; critical flows covered by vitest + mocked fetch

## Development

```bash
pnpm dev:web    # http://localhost:3000
pnpm dev:api    # http://localhost:3001/api/v1
```

Set `BACKEND_API_URL=http://localhost:3001` in the web app environment if not using defaults.

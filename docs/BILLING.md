# Billing

Internal rating and invoice generation run inside the NestJS API (`apps/api/src/modules/billing/`). Stripe remains **DISABLED**; no external payment or invoice sync occurs in this slice.

## Pipeline

```text
ai_usage (raw, append-only)
  → usage_events (normalized, idempotent key)
  → rated_usage (priced snapshot, idempotent per usage_event_id)
  → invoice_lines (draft/finalized snapshot)
```

Deterministic AI usage always records `providerCostStatus: UNAVAILABLE`. Customer charges use the tenant price book only.

## Price books and plans

- **Price books** group versioned **prices** per meter (`FLAT`, `PER_UNIT`; `TIERED`/`VOLUME` schema-ready, unrated until implemented).
- Price updates deactivate the prior row and insert a new version with `effective_from`; historic `rated_usage.price_snapshot` is immutable.
- **Plans** attach entitlements (included quantity per meter), flat `monthlyAmount`, and a price book.
- **Subscriptions** bind tenants to plans for allowance and recurring charges.

## Allowances and overage

Included usage is applied per meter before overage. Allowances reset each billing period. Invoice preview/generation emits separate `included`, `overage`, and `usage` line types.

## Tax and currency

- Tenant billing currency is stored on `tenant_billing_profiles` (default USD).
- Tax rate and tax-inclusive flag apply at invoice build time (default 20% exclusive VAT in dev seed profile).
- Currency mismatch between profile and invoice request returns a structured validation error; no silent FX conversion.

## Credits and adjustments

`credit_ledger` is append-only. Manual credits/debits via `POST /api/v1/credits/adjustments`. Credits apply at invoice finalization (FIFO balance reduction).

## Invoices

States: `draft`, `finalized`, `void`, `paid`, `payment_failed` (paid/payment_failed are internal/test-only in this slice).

- **Preview** — no persistence; metadata includes `stripeStatus: DISABLED`.
- **Generate** — draft invoice with idempotency key; duplicate key returns existing invoice.
- **Finalize** — immutable lines; applies credits; sets `finalized_at`.
- **Void** — allowed for non-paid invoices.

### Late usage policy

Usage with `event_timestamp` in a closed (finalized) period is billed in the **next** period as adjustment/overage lines. Finalized invoice lines are never rewritten.

## Rating engine service

`services/rating-engine/` remains a **health-only scaffold**. Deterministic rating executes in the API module to avoid duplicate implementations. Activate the Go service only when async ingestion and bounded retries are required.

## API surface

See [API.md](./API.md) and OpenAPI (`/api/v1/openapi`) for plans, prices, usage, rated-usage, credits, and invoice routes.

## Limitations (Slice D)

- No Stripe checkout, payment intents, or external invoices
- No PSTN/carrier billing or provider-cost reconciliation
- No live foreign-exchange conversion
- Tiered/volume pricing marked unrated until implemented
- Per-extension and number-rental recurring fees: schema-ready; invoice lines for subscription flat fee only today

See [USAGE_METERING.md](./USAGE_METERING.md) and [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md).

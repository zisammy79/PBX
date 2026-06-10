# Data Model

All tenant-owned entities include `tenant_id`. UUIDs used for primary keys. Timestamps in UTC. Monetary fields use `numeric(18,6)` or `numeric(18,2)`.

## Entity groups

### Platform & identity

- `tenants`, `tenant_settings`, `locations`
- `users`, `tenant_memberships`, `roles`, `permissions`, `role_permissions`
- `sessions`, `support_sessions`

### Telephony

- `extensions`, `sip_credentials`, `sip_registrations`
- `sip_trunks`, `sip_trunk_endpoints`, `phone_numbers`
- `inbound_routes`, `outbound_routes`
- `ring_groups`, `ring_group_members`, `queues`, `queue_members`
- `ivrs`, `ivr_options`, `business_schedules`
- `call_flows`, `call_flow_versions`, `voicemails`

### Calls

- `calls`, `call_legs`, `call_events`, `call_recordings`, `transcripts`
- `carrier_usage`

### AI

- `ai_provider_connections`, `ai_agents`, `ai_agent_versions`
- `ai_tools`, `ai_knowledge_sources`, `ai_sessions`, `ai_usage`

### Billing

- `usage_events` (append-only, idempotency key)
- `rated_usage`, `price_books`, `prices`, `plans`, `plan_entitlements`
- `subscriptions`, `credit_ledger`, `invoices`, `invoice_lines`, `payments`

### API & audit

- `api_applications`, `api_keys`, `webhook_endpoints`, `webhook_deliveries`
- `audit_events`, `security_events`, `provider_health`

## Schema location

Drizzle schema: `packages/database/src/schema/`

Generate migrations: `pnpm db:generate`

## Immutability rules

- `usage_events`: append-only, integrity hash
- `audit_events`, `credit_ledger`: append-only
- Financial records: no hard delete

## RLS (planned)

Row-level security policies on tenant-scoped tables using `current_setting('app.tenant_id')` — Stage 6.

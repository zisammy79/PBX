# Implementation Roadmap

## Completed: Stage 1–6 Foundation

| Stage | Deliverable | Status |
|-------|-------------|--------|
| 1 | Repository inspection | Done |
| 2 | Architecture documentation | Done |
| 3 | Threat model | Done |
| 4 | Data model & API contracts | Done |
| 5 | Local infrastructure (Docker) | Done |
| 6 | Core control plane | Done |

### Foundation acceptance criteria

- [x] Monorepo structure
- [x] All required entities in Drizzle schema
- [x] JWT auth with explicit permissions
- [x] Tenant guard rejects cross-tenant access
- [x] Platform admin creates tenant
- [x] Tenant owner creates extensions with SIP credentials
- [x] Health endpoints
- [x] Unit tests for permissions and tenant isolation
- [x] `make verify` command

## Next: Stage 7 — Telephony vertical slice

1. Asterisk PJSIP automation per tenant
2. Telephony controller (Go) + ARI
3. Extension registration status sync
4. Extension-to-extension call
5. Active call events to API
6. CDR and usage event emission
7. Generic SIP trunk CRUD + OPTIONS test
8. SIPp integration tests

## Stage 8 — Realtime AI vertical slice

1. AI Media Gateway (Go)
2. OpenAI Realtime + Gemini Live adapters
3. AI agent CRUD and versioning
4. Route call to AI agent
5. Barge-in and transfer to extension

## Production V1 (in progress)

| Item | Status |
|------|--------|
| OpenAI Realtime adapter | Implemented — contract tests pass |
| Generic SIP/PSTN trunk | Implemented — config validation passes |
| Stripe test mode | Implemented — contract tests pass |
| Production safeguards | Validated |
| Live integration | **Configure in Platform Owner UI** or optional env fallback |

See [PRODUCTION_V1_CLOSEOUT_PLAN.md](./PRODUCTION_V1_CLOSEOUT_PLAN.md).

## Stage 9 — Usage and billing vertical slice

1. Usage event ingestion worker
2. Rating engine
3. Tenant usage dashboard data
4. Signed `call.completed` webhooks
5. Platform margin reporting

## Stage 10 — User interfaces

Operator and tenant Next.js portals, softphone, setup wizard.

## Stage 11 — DigitalOcean deployment

Terraform, Ansible, firewall, TLS, backups.

## Stage 12 — Verification and operations

Full test plan, runbooks, capacity guide.

# PBX Platform

Multi-tenant virtual PBX platform with Asterisk/PJSIP telephony, multi-customer isolation, extension and call management, realtime AI media architecture, barge-in and human transfer, usage metering, rating and internal invoicing, tenant and platform-administration UI, API keys, signed webhooks, and deployment and operations assets.

Production-v1 implementation is complete through the external-integration boundary. Live OpenAI, PSTN and Stripe verification remain required before controlled production deployment.

## Current status

Branch: `feature/pbx-multitenant-closeout`

### Current capabilities (verified locally)

| Capability | Status |
|------------|--------|
| Multi-tenant control plane | PASS |
| Authentication and permissions | PASS |
| PostgreSQL RLS | PASS |
| Encrypted credential storage | PASS |
| **SIP extension registration** | **PASS** |
| **Extension-to-extension internal calls** | **PASS** |
| RTP media | PASS |
| ARI call tracking and call lifecycle | PASS |
| Public SIP / NAT (`rewrite_contact`, external media) | PASS |
| **Call recording capture (ARI bridge)** | **PASS** |
| **Recording finalization and persistent local WAV storage** | **PASS** |
| Recording metadata in UI (call details, extension list) | PASS |
| **Authenticated API byte-range streaming (`/content`)** | **PASS** |
| **Browser call-details audio playback** | **UNDER REPAIR** — see playback section |
| Deterministic realtime AI media | PASS |
| Barge-in, tool invocation, human transfer | PASS |
| Usage metering, rating, internal invoices | PASS |
| Tenant UI, Platform Owner UI | PASS |
| API keys, signed webhooks | PASS |
| Local demo workflow | PASS |
| Deployment and operations assets | PASS |

### Implemented but awaiting live verification

| Capability | Status |
|------------|--------|
| OpenAI Realtime | NOT_TESTED — requires provider credentials |
| Real SIP carrier / PSTN inbound and outbound | NOT_TESTED — requires carrier configuration |
| Stripe test-mode lifecycle | NOT_TESTED — requires Stripe test credentials |

### Not performed or deferred

| Capability | Status |
|------------|--------|
| DigitalOcean deployment | NOT_PERFORMED |
| Stripe live payments | NOT_IMPLEMENTED |
| Production PSTN verification | NOT_PERFORMED |
| High availability | NOT_IMPLEMENTED |
| Multi-region deployment | NOT_IMPLEMENTED |
| Compliance certification | NOT_PERFORMED |
| WebRTC browser softphone | NOT_IMPLEMENTED |

## Local development startup

```bash
cd /path/to/pbx
cp .env.example .env
# Set JWT_SECRET and ENCRYPTION_MASTER_KEY (openssl rand -hex 32)
make install
make dev-up
make db-migrate && make db-seed
pnpm dev:api    # http://localhost:3001
pnpm dev:web    # http://localhost:3000
make telephony-up   # Asterisk + telephony-controller (optional, for SIP/recording)
```

Health check: `curl -fsS http://127.0.0.1:3001/api/v1/health/live`

## Public SIP configuration

Extensions register over UDP SIP. Configure in `.env`:

| Variable | Purpose |
|----------|---------|
| `SIP_UDP_BIND` / `SIP_UDP_PUBLISH` | Host bind and published UDP port (default `5060`) |
| `SIP_EXTERNAL_IP` | Public IPv4 for NAT (`external_signaling_address` / `external_media_address`) |
| `SIP_PUBLIC_DOMAIN` | Optional domain for softphone Domain field |

Router must forward WAN UDP `5060` and `10000–10099` to the PBX host. CGNAT blocks inbound SIP.

Validate: `bash scripts/validate-telephony-compose.sh`, `bash scripts/check-extension-registration.sh <tenant-slug> <ext>`

## Extension registration

Softphone setup: **Username**, **Password** (one-time after rotate), **Domain** (`SIP_PUBLIC_DOMAIN` or public IPv4), UDP port 5060.

Registration status: `GET /api/v1/extensions/registration-status` (batch online/offline from ARI).

## Extension-to-extension calling

Internal calls route through Asterisk PJSIP endpoints. telephony-controller sequences ring-before-answer and bridges after callee answers. Requires both extensions registered.

## Recording policy

| Level | Setting | Default |
|-------|---------|---------|
| Organization | `tenant_settings.telephony.recording.recordCallsByDefault` | **off** |
| Extension | `extensions.recording_policy_mode` (`inherit` \| `on` \| `off`) | `inherit` |

Effective policy: extension override wins; internal calls record if **any** participant is effectively on.

## Local recording storage

Environment variables (host-specific paths — do not commit real values):

```text
CALL_RECORDING_STORAGE_BACKEND=local
CALL_RECORDING_LOCAL_ROOT=<host persistent path visible to API>
CALL_RECORDING_HOST_ROOT=<Docker bind source for shared volume>
```

Path contract:

| Component | Container path |
|-----------|----------------|
| Asterisk | `/var/spool/asterisk/recording` |
| telephony-controller | `/var/lib/pbx/recordings` |
| Host API | `CALL_RECORDING_LOCAL_ROOT` (same host directory as Docker bind) |

Lifecycle: `starting → recording → processing → available | failed`. Stale repair: `bash scripts/reconcile-stale-recordings.sh [id]`

## Call-details playback architecture

1. UI loads recording metadata via `GET /api/v1/tenants/:tenantId/calls/:callId/recordings`
2. Play fetches binary content via Next.js proxy → `GET /api/v1/tenants/:tenantId/recordings/:recordingId/content`
3. Frontend validates RIFF/WAVE headers, creates `audio/wav` Blob URL for `<audio>` element
4. API supports `Accept-Ranges: bytes` and HTTP 206 for seek

**Known limitation:** browser playback via the web UI proxy is under active repair; direct authenticated API download of the WAV is verified.

Supported format: Microsoft PCM WAV, 16-bit mono 8000 Hz (Asterisk default).

## Required environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `JWT_SECRET` | yes | 64-char hex |
| `ENCRYPTION_MASTER_KEY` | yes | 64-char hex |
| `DATABASE_URL` | yes | PostgreSQL |
| `CALL_RECORDING_STORAGE_BACKEND` | for recording | `local` or `s3` |
| `CALL_RECORDING_LOCAL_ROOT` | for local recording | Host path |
| `CALL_RECORDING_HOST_ROOT` | for Docker telephony | Bind mount source |
| `SIP_EXTERNAL_IP` | for public SIP | Public IPv4 |
| OpenAI / Stripe / carrier | external gates | Platform Owner UI or env fallback |

## Migrations

```bash
pnpm db:generate   # after schema changes
make db-migrate
make db-seed       # dev only; ALLOW_DEV_SEED=true
```

Recording-related migrations: `0009_call_recording_local.sql`, `0011_recording_starting_status.sql`

## Testing commands

```bash
make foundation-verify
npx pnpm --filter @pbx/contracts run build
npx pnpm --filter @pbx/shared run build
npx pnpm --filter @pbx/database run build
npx pnpm --filter @pbx/api run typecheck
npx pnpm --filter @pbx/api run test
npx pnpm --filter @pbx/web run typecheck
npx pnpm --filter @pbx/web run test
npx pnpm --filter @pbx/api run openapi:generate
npx pnpm --filter @pbx/telephony-config test
go test ./...   # in services/telephony-controller
bash scripts/validate-telephony-compose.sh
bash scripts/validate-recording-finalize-e2e.sh
bash scripts/secret-scan.sh
make deploy-validate
git diff --check
```

## Known external blockers

- **PSTN** — requires SIP carrier credentials in Platform Owner → Integrations
- **Stripe** — requires test-mode credentials
- **OpenAI Realtime** — requires provider credentials
- **DigitalOcean deployment** — assets validated; cloud apply not performed

## Security notes

- Never commit `.env`, SIP passwords, generated PJSIP files with credentials, recording WAV/MP3 files, or `var/recordings/`
- Recording content requires `TENANT_RECORDING_READ` permission; tenant-isolated via RLS
- API `/content` endpoint does not expose filesystem paths
- See [docs/SECURITY_OPERATIONS.md](docs/SECURITY_OPERATIONS.md)

## Architecture

### Principal components

```text
apps/api                    NestJS control plane API
apps/web                    Next.js tenant and platform-admin UI
apps/worker                 Background jobs (webhook delivery)
services/telephony-controller   Asterisk ARI integration (Go)
services/ai-media-gateway       Realtime AI audio (Go)
services/rating-engine          Usage rating (Go)
packages/contracts          Shared types, permissions, API schemas
packages/database           Drizzle ORM schema and migrations
packages/provider-sdk       Provider adapter interfaces
packages/telephony-config   Asterisk config generation
infrastructure/asterisk     Asterisk configs and generated tenant configs
infrastructure/docker       Local and production Docker Compose
infrastructure/terraform    DigitalOcean deployment
infrastructure/ansible      Host provisioning
```

### Request and event flow

```mermaid
flowchart LR
  UI[User / UI] --> API[API / control plane]
  API --> PG[(PostgreSQL)]
  API --> Redis[(Redis)]
  API --> NATS[(NATS)]
  API --> AST[Asterisk]
  AST --> TC[telephony-controller]
  TC --> AIG[AI media gateway]
  AIG --> AI[deterministic or external AI provider]

  API --> Usage[usage events]
  Usage --> Rating[rating-engine]
  Rating --> Invoice[internal invoice]

  API --> Events[application events]
  Events --> Worker[webhook worker]
  Worker --> WH[signed tenant webhook]
```

## Security model

- **Tenant context** — derived from authenticated membership or API key; enforced on every request
- **PostgreSQL RLS** — row-level isolation for tenant-scoped data
- **Explicit permissions** — role-based access with fine-grained permission checks
- **Encrypted integration credentials** — AES-256-GCM envelope encryption; secrets never returned on read
- **Hashed API keys** — stored as hashes; plaintext shown once at creation
- **One-time secret display** — integration secrets cannot be viewed after saving
- **Internal resolver** — protected by `INTERNAL_SERVICE_TOKEN`; used by runtime services
- **Audit events** — credential changes, assignments, and validation recorded
- **SSRF protections** — webhook delivery and validation endpoints restricted
- **HMAC-signed webhooks** — outbound tenant webhooks signed with per-endpoint secrets
- **Rate limiting and idempotency** — API rate limits; Stripe webhook idempotency

Bootstrap secrets remain environment/KMS managed and are not editable in the UI:

- Database credentials
- JWT secret
- Encryption master key
- Internal service tokens
- ARI administrative credentials
- Backup encryption key

See [docs/SECURITY_OPERATIONS.md](docs/SECURITY_OPERATIONS.md) and [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md).

## Quick local demo

```bash
cd /home/media/Downloads/pbx
cp .env.demo.example .env.demo
make demo-local-up
make demo-local-seed
make demo-local-smoke
make demo-local-status
```

Open [http://localhost:3000](http://localhost:3000).

Generated demo credentials are stored locally in `.local/demo-credentials.json`. Available demo roles:

- **administrator** — Platform Owner account for the demo
- **owner**
- **billing**
- **agent**

Passwords are generated at seed time and are not stored in the repository.

Stop or reset:

```bash
make demo-local-reset
make demo-local-down
```

See [docs/DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md) for the full demonstration sequence.

## Platform Owner integration configuration

Runtime credentials for external integrations are configured in **Platform Administration → Integrations**:

- OpenAI Realtime
- SIP carriers
- Stripe (test and live modes)
- Tenant assignments
- Platform defaults and tenant overrides
- Credential rotation
- Configuration and network validation
- Audit history

Secret values cannot be viewed after saving. Only `credentialConfigured: true` and metadata are returned on read.

**Resolution order:**

```text
tenant assignment
→ tenant-owned connection
→ assigned platform connection
→ platform default
→ explicitly enabled environment fallback
```

See [docs/INTEGRATION_CREDENTIAL_MANAGEMENT.md](docs/INTEGRATION_CREDENTIAL_MANAGEMENT.md).

## Development setup

### Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 22.0.0 |
| pnpm | ≥ 9.0.0 (repo pins `pnpm@9.15.0`) |
| Go | ≥ 1.24 |
| Docker | with Docker Compose |

### Initialize environment

```bash
cp .env.example .env
# Set JWT_SECRET and ENCRYPTION_MASTER_KEY to 64-char hex values:
# openssl rand -hex 32
```

### Install dependencies

```bash
make install
```

### Start infrastructure

```bash
make dev-up
```

### Run migrations and seed

```bash
pnpm db:generate
make db-migrate
make db-seed
```

### Start application services

```bash
pnpm dev:api          # API on http://localhost:3001
pnpm dev:web          # Web UI on http://localhost:3000
pnpm --filter @pbx/worker dev   # Webhook worker
```

### Start telephony and AI (optional, for full stack)

```bash
make telephony-up
make ai-up
```

API: `http://localhost:3001/api/v1`  
Web UI: `http://localhost:3000`

## Verification commands

### Local and contract verification

```bash
make foundation-verify
bash scripts/stage7-sip-live-test.sh
bash scripts/stage7-isolation-test.sh
bash scripts/stage8-sip-ai-deterministic-test.sh
bash scripts/stage8-sip-ai-behavior-test.sh
make credential-runtime-contract-test
make deploy-validate
bash scripts/secret-scan.sh
```

### External live gates (require credentials; may contact paid services)

```bash
make stage8-openai-live-test
make pstn-outbound-test
make pstn-inbound-test
make stripe-test-mode-verify
make production-v1-verify
```

These commands require locally configured integration credentials and may incur charges from external providers. They have **not** been run as part of the current release checkpoint.

## Deployment

| Asset | Description |
|-------|-------------|
| Local demo | `make demo-local-up` — full product demo on localhost |
| Production Compose | `infrastructure/docker/docker-compose.production.yml` |
| Terraform | DigitalOcean droplet, firewall, DNS, block storage |
| Ansible | Host bootstrap, Docker, persistent volumes |
| Caddy | TLS termination and reverse proxy |
| Prometheus / Grafana | Monitoring and dashboards |
| Backup and restore | `scripts/backup-production.sh`, `scripts/restore-production.sh` |
| Dry-run deployment | `make deploy-dry-run` |

**DigitalOcean deployment has not been performed.** Deployment assets are validated locally but no cloud resources have been provisioned.

See:

- [docs/DIGITALOCEAN_DEPLOYMENT.md](docs/DIGITALOCEAN_DEPLOYMENT.md)
- [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md)
- [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md)

## Network ports

### Production-facing

| Port | Protocol | Purpose |
|------|----------|---------|
| 22 | TCP | Restricted administration (SSH) |
| 80 | TCP | HTTP redirect / certificate bootstrap |
| 443 | TCP | Web UI and API |
| 5060 | UDP or TCP | SIP (when enabled) |
| 5061 | TCP | SIP TLS (when enabled) |
| 10000–10099 | UDP | RTP media |

### Must remain private

PostgreSQL, Redis, NATS, Asterisk ARI, MinIO administration, API internal port, AI media gateway, and telephony-controller ports must not be exposed publicly.

## Repository documentation

| Document | Description |
|----------|-------------|
| [docs/DEMO_RUNBOOK.md](docs/DEMO_RUNBOOK.md) | Local product demo workflow |
| [docs/API.md](docs/API.md) | API reference and OpenAPI |
| [docs/WEBHOOKS.md](docs/WEBHOOKS.md) | Signed outbound webhooks |
| [docs/BILLING.md](docs/BILLING.md) | Billing and invoicing |
| [docs/USAGE_METERING.md](docs/USAGE_METERING.md) | Usage event collection and metering |
| [docs/INTEGRATION_CREDENTIAL_MANAGEMENT.md](docs/INTEGRATION_CREDENTIAL_MANAGEMENT.md) | Platform Owner credential management |
| [docs/SECURITY_OPERATIONS.md](docs/SECURITY_OPERATIONS.md) | Security operations guide |
| [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md) | Production operations |
| [docs/DIGITALOCEAN_DEPLOYMENT.md](docs/DIGITALOCEAN_DEPLOYMENT.md) | Cloud deployment guide |
| [docs/BACKUP_RESTORE.md](docs/BACKUP_RESTORE.md) | Backup and restore procedures |
| [docs/DISASTER_RECOVERY.md](docs/DISASTER_RECOVERY.md) | Disaster recovery |
| [docs/CAPACITY_PLANNING.md](docs/CAPACITY_PLANNING.md) | Capacity planning |
| [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) | Known limitations |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Implementation roadmap |

## Known limitations

- Live OpenAI verification pending
- SIP carrier inbound/outbound verification pending
- Stripe test-mode verification pending
- **Browser call-details recording playback under repair** (API streaming verified)
- SIP network validation currently supports UDP; TCP/TLS validation remains pending
- DigitalOcean deployment not performed
- High availability not implemented
- Compliance certification not performed
- Emergency calling disabled by default
- Recording disabled by default until configured

See [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md) for details.

## GitHub status

The `main` branch contains the current secret-free implementation. Checkpoint tag: `production-v1-non-secret-82` (commit `115dfff`). This release adds runtime integration management on top of that baseline.

## License

Proprietary — all rights reserved.

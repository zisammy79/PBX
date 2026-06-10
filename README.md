# PBX Platform

Multi-tenant AI-native virtual PBX SaaS platform.

## Status

**Non-AI platform at 92%.** Slices A–G complete including DigitalOcean deployment and operations assets. Next: Slice H (final security and release-readiness verification).

## Quick start

### Prerequisites

- Node.js 22+
- pnpm 9+
- Docker and Docker Compose

### Local development

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET and ENCRYPTION_MASTER_KEY to 64-char hex values:
# openssl rand -hex 32

make install
make dev-up
pnpm db:generate
make db-migrate
make db-seed

pnpm dev:api
pnpm dev:web
```

API: `http://localhost:3001/api/v1`  
Web UI: `http://localhost:3000`

Default platform admin (after seed): `admin@pbx.local` / `ChangeMeAdmin123!`

### Verification

```bash
make verify
```

### Production deployment validation

```bash
bash scripts/validate-deployment-assets.sh
bash infrastructure/tests/deployment-validation.test.sh
```

See [docs/DIGITALOCEAN_DEPLOYMENT.md](docs/DIGITALOCEAN_DEPLOYMENT.md). **No cloud resources are created by these commands.**

## Repository structure

```text
apps/
  api/          NestJS control plane API
  web/          Next.js tenant and platform-admin UI
  worker/       Background jobs (planned)
services/
  telephony-controller/   Asterisk ARI integration (Go)
  ai-media-gateway/       Realtime AI audio (Go)
  rating-engine/          Usage rating (Go)
packages/
  contracts/    Shared types, permissions, API schemas
  database/     Drizzle ORM schema and migrations
  shared/       Crypto, tenant prefixes, utilities
  provider-sdk/ Provider adapter interfaces (planned)
  ui/           Shared React components (planned; currently in apps/web/components)
infrastructure/
  docker/       Local development stack
  asterisk/     Asterisk configs (telephony stage)
  coturn/       WebRTC TURN (telephony stage)
  terraform/    DigitalOcean deployment (deployment stage)
  ansible/      Host provisioning (deployment stage)
docs/           Architecture and operational documentation
```

## First vertical slice progress

| Step | Status |
|------|--------|
| Platform admin sign-in | Implemented |
| Admin creates tenant | Implemented |
| Tenant owner created | Implemented |
| Tenant owner creates extensions | Implemented |
| SIP credentials generated | Implemented |
| Extensions register with Asterisk | Pending (Stage 7) |
| Extension-to-extension call | Pending (Stage 7) |
| AI agent call | Pending (Stage 8) |
| Usage and billing | Pending (Stage 9) |

See [docs/ROADMAP.md](docs/ROADMAP.md) for the full implementation plan.

## Security

- Never commit `.env` or secrets
- Change default admin password immediately
- Asterisk ARI/AMI must not be exposed publicly
- See [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)

## License

Proprietary — all rights reserved.

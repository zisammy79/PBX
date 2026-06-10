# Local Product Demo Runbook

This runbook describes the localhost product demo workflow for **Demo Company**.

## Start

```bash
cd /home/media/Downloads/pbx
cp .env.demo.example .env.demo
# Edit generated local secrets if needed (validate-env auto-generates missing values)
make demo-local-up
make demo-local-seed
make demo-local-smoke
```

## Open

```text
http://localhost:3000
```

Sign in with credentials from `.local/demo-credentials.json` (platform admin or demo tenant users).

## Demonstration order

1. Platform dashboard
2. Tenant isolation
3. Extensions
4. Internal SIP call
5. Active and completed call views
6. Deterministic realtime AI call
7. Barge-in
8. Human transfer
9. AI diagnostics
10. Usage and rating
11. Invoices and credits
12. API keys
13. Webhooks
14. Deployment-readiness assets
15. Honest deferred-capability summary

## Deferred capabilities (honest summary)

- External AI verification — Not tested
- Payment integration — Disabled
- Provider cost — Unavailable
- PSTN verification — Not performed
- Production cloud deployment — Not part of this local demo

## Recovery

### Status

```bash
make demo-local-status
```

### Reset demo data

```bash
make demo-local-reset
```

### Restart services

```bash
make demo-local-down
make demo-local-up
make demo-local-seed
```

### Rerun smoke test

```bash
make demo-local-smoke
```

### Stop demo

```bash
make demo-local-down
```

Destructive volume removal (optional, explicit):

```bash
DEMO_DOWN_DESTRUCTIVE=true make demo-local-down
```

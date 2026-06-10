# Local Product Demo Evidence

This file records evidence from the local demo operator flow executed on 2026-06-10.

## Commands executed

| Step | Command | Exit code |
|------|---------|-----------|
| 1 | `cp .env.demo.example .env.demo` | 0 |
| 2 | `make demo-local-up` | 0 |
| 3 | `make demo-local-seed` | 0 |
| 4 | `make demo-local-smoke` | 0 |

## Service health

| Service | Status |
|---------|--------|
| Web (:3000) | healthy |
| API (:3001) | healthy |
| PostgreSQL | healthy |
| Redis | healthy |
| NATS | healthy |
| Worker | running |
| Asterisk | healthy |
| ARI | connected |
| Telephony controller | healthy |
| AI media gateway | healthy |

## Demo seed status

| Check | Status |
|-------|--------|
| Demo tenant (`Demo Company`) | PASS |
| Demo users | PASS |
| Extensions 1001/1002 | PASS |
| Deterministic AI agent | PASS |
| Usage + rated usage | PASS |
| Invoice preview | PASS (Stripe disabled) |
| API key auth | PASS |
| Webhook delivery | PASS |

## Telephony verification

| Test | Result |
|------|--------|
| Stage 7 internal SIP | PASS (`STAGE7_SIP_LIVE`) |
| Stage 8 deterministic media | PASS (`STAGE8_DETERMINISTIC_SIP_AI`) |
| Stage 8 barge-in + transfer | PASS (`STAGE8_DETERMINISTIC_BEHAVIOR`) |

## API and billing checks

| Check | Result |
|-------|--------|
| API key authentication | PASS |
| Webhook fixture delivery | PASS |
| Invoice preview | PASS |

## Known limitations

- External AI providers are unset; demo uses deterministic local AI mode only.
- Stripe and PSTN remain disabled.
- Provider cost reporting is unavailable.
- DigitalOcean production deployment is out of scope for this demo.
- PostgreSQL connection recycling is required before seed when many dev processes are active.

## Notes

- Demo credentials: `.local/demo-credentials.json` (owner-only permissions).
- Smoke test clears local auth rate-limit keys in Redis to avoid repeated login throttling during telephony scripts.

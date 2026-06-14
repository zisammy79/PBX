# Release Notes — Non-AI Platform

**Latest closeout branch:** `feature/pbx-multitenant-closeout`

## 2026-06-14 — Recording pipeline closeout

### Verified

- SIP extension registration and internal extension-to-extension calls
- ARI bridge recording capture, finalization, persistent local WAV storage
- Recording metadata in call-details and extension UI
- Authenticated API byte-range streaming (`GET .../recordings/:id/content`)

### Under repair

- Browser call-details audio playback (Next.js proxy binary passthrough)

### External gates (unchanged)

- OpenAI Realtime, PSTN carrier, Stripe test mode — require Platform Owner credentials

---

**Release ID:** `pbx-non-ai-20260609T193647Z`  
**Date:** 2026-06-09

## Highlights

Final Slice H verification closes release blockers and validates regressions, security, deployment assets, and artifact generation for controlled staging deployment.

### Release blockers resolved

- Credit adjustment idempotency via `Idempotency-Key` header and `IdempotencyService`
- Canonical OpenAPI generation (`apps/api/openapi/openapi.json`)
- Webhook catalogue accuracy (operational vs deferred events)
- Non-interactive web ESLint (`eslint . --max-warnings=0`)
- Worker webhook restart semantics (pending resume, dead-letter terminal)
- Integration test reliability: API port readiness, admin credential resolution, telephony event ordering tolerance

### Verification

- Foundation, Stage 7 SIP/isolation, Stage 8 deterministic AI and barge-in/transfer behavior
- API/database/worker/web/Go test suites
- Secret scan, deployment dry-runs, backup/restore dry-runs
- Tenant isolation and RLS integration

## Deferred / disabled

| Feature | Status |
|---------|--------|
| External AI (OpenAI Realtime) | DEFERRED — deterministic test provider only |
| Stripe payments | DISABLED |
| DigitalOcean apply | NOT_PERFORMED (assets validated) |
| PSTN production | NOT_PERFORMED |
| High availability | NOT_IMPLEMENTED |
| WebRTC / TURN | DEFERRED |

## Upgrade notes

- Ensure `DEV_ADMIN_PASSWORD` is set before seed on fresh environments; bootstrap credentials rotate via `ALLOW_DEV_SEED=true pnpm db:seed`.
- Telephony integration scripts use `scripts/lib/ensure-api-running.sh` and `scripts/lib/admin-credentials.sh`.
- Production requires `ALLOW_DEV_SEED=false` and Stripe variables unset.

## Known limitations

See [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md).

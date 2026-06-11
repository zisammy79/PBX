# Current Gap Matrix — PBX Final Closeout

**Reconciled:** 2026-06-10
**Baseline commit:** `f81cd73` (tag: `production-v1-runtime-integrations`)
**Remote:** `git@github.com:zisammy79/PBX.git` — `origin/main` in sync with local `main`

This matrix classifies stale external-review claims against current repository evidence. The repository, tests, migrations, and generated evidence are authoritative.

## Stale review claim corrections

| Stale claim | Classification | Current evidence |
|-------------|----------------|------------------|
| Human transfer remained blocked | **COMPLETED_AFTER_REVIEW** | `bash scripts/stage8-sip-ai-behavior-test.sh` proves barge-in + `transfer_call` → extension 1002; `docs/STAGE8_IMPLEMENTATION_LOG.md` Slice 8.9; `docs/DEMO_EVIDENCE.md` Stage 8 barge-in + transfer PASS; README lists Human transfer PASS |
| Git push was unconfirmed | **COMPLETED_AFTER_REVIEW** | `f81cd73` on `origin/main`; tag `production-v1-runtime-integrations` pushed; `git log main...origin/main` shows no divergence |
| README closeout was unconfirmed | **COMPLETED_AFTER_REVIEW** | `README.md` at `f81cd73` includes full status table, architecture, demo, integrations, verification commands; distinguishes verified vs awaiting live verification vs deferred |
| Production security and operations were incomplete | **COMPLETED_AFTER_REVIEW** | `docs/SECURITY_VERIFICATION.md`; `docs/OPERATIONS_RUNBOOK.md`; `make deploy-validate`; integration credential encryption + resolver in `apps/api/src/modules/integrations/` |
| Usage/rating evidence was incomplete | **COMPLETED_AFTER_REVIEW** | `docs/NON_AI_FINAL_EVIDENCE.md`; billing integration tests; `docs/USAGE_METERING.md`; `docs/BILLING.md`; demo seed usage + rated usage PASS in `docs/DEMO_EVIDENCE.md` |
| Stage 7 internal telephony not done | **COMPLETED_AFTER_REVIEW** | `docs/STAGE7_FINAL_EVIDENCE.md`; `bash scripts/stage7-sip-live-test.sh` |
| Deterministic AI not proven | **COMPLETED_AFTER_REVIEW** | `bash scripts/stage8-sip-ai-deterministic-test.sh`; `docs/STAGE8_AI_VOICE_VERTICAL_SLICE.md` |
| Platform Owner credential management missing | **COMPLETED_AFTER_REVIEW** | `f81cd73` adds integrations API/UI, migrations `0007`/`0008`, `make credential-runtime-contract-test` PASS |
| Tenant isolation unverified | **CURRENTLY_VERIFIED** | `bash scripts/stage7-isolation-test.sh`; RLS integration tests; `docs/SECURITY_VERIFICATION.md` |
| Local demo not working | **CURRENTLY_VERIFIED** | `docs/DEMO_EVIDENCE.md`; `make demo-local-smoke` workflow documented |
| API keys and webhooks incomplete | **CURRENTLY_VERIFIED** | Slice F integration; worker webhook deliverer tests; `docs/WEBHOOKS.md` |
| Deployment assets missing | **CURRENTLY_VERIFIED** | Terraform, Ansible, production Compose, Caddy, Prometheus; `make deploy-validate` |

## Unsupported stale claims (no repository support)

| Claim | Classification | Notes |
|-------|----------------|-------|
| Platform is production-deployed on DigitalOcean | **UNSUPPORTED_CLAIM** | `DIGITALOCEAN_DEPLOYMENT: NOT_PERFORMED` everywhere |
| OpenAI live verification passed | **UNSUPPORTED_CLAIM** | README and `docs/KNOWN_LIMITATIONS.md` state NOT_TESTED |
| PSTN live verification passed | **UNSUPPORTED_CLAIM** | NOT_TESTED / NOT_PERFORMED |
| Stripe test-mode live verification passed | **UNSUPPORTED_CLAIM** | NOT_TESTED |
| High availability implemented | **UNSUPPORTED_CLAIM** | NOT_IMPLEMENTED |
| Compliance certification performed | **UNSUPPORTED_CLAIM** | NOT_PERFORMED |

## Deferred (explicitly out of closeout scope)

| Item | Classification |
|------|----------------|
| DigitalOcean apply / paid resource creation | **DEFERRED** |
| High availability / multi-region | **DEFERRED** |
| Compliance certification (SOC2, PCI) | **DEFERRED** |
| WebRTC browser softphone | **DEFERRED** |
| Additional AI providers beyond OpenAI Realtime | **DEFERRED** |
| Stripe live payments | **DEFERRED** |

## Actual P0 blockers (production-v1 closeout)

| Blocker | Classification | Verification command | Status |
|---------|----------------|---------------------|--------|
| OpenAI Realtime live verification | **ACTUAL_BLOCKER** | `make stage8-openai-live-test` | NOT_TESTED — requires Platform Owner credentials |
| PSTN outbound live verification | **ACTUAL_BLOCKER** | `make pstn-outbound-test` | NOT_TESTED — requires carrier credentials |
| PSTN inbound live verification | **ACTUAL_BLOCKER** | `make pstn-inbound-test` | NOT_TESTED — requires carrier credentials |
| Stripe test-mode live verification | **ACTUAL_BLOCKER** | `make stripe-test-mode-verify` | NOT_TESTED — requires Stripe test credentials |
| Final clean regression (this closeout run) | **CURRENTLY_VERIFIED** | Phase 3–4 commands | PASS — see [QA_REPORT.md](../QA_REPORT.md) |
| Latest Git and release closeout | **ACTUAL_BLOCKER** | Phase 5 tag `production-v1-pre-live-verification` | In progress this session |

## Implemented and contract-ready (non-live)

| Item | Classification | Verification |
|------|----------------|--------------|
| OpenAI Realtime adapter | **CURRENTLY_VERIFIED** (contract) | `make stage8-openai-contract-test` |
| SIP carrier schema + config generator | **CURRENTLY_VERIFIED** (contract) | `make pstn-config-validate` |
| SIP UDP REGISTER/OPTIONS validation | **CURRENTLY_VERIFIED** | Platform UI + `sip-network-validator.ts` |
| Stripe test-mode implementation | **CURRENTLY_VERIFIED** (contract) | `make stripe-contract-test` |
| Runtime credential resolver | **CURRENTLY_VERIFIED** | `make credential-runtime-contract-test` |
| Production safeguards | **CURRENTLY_VERIFIED** | `make production-v1-safeguards` |

## Regression watch (not stale — must re-verify)

| Area | Risk | Action |
|------|------|--------|
| Integration migrations 0007/0008 | Schema drift if not applied | `pnpm --filter @pbx/database db:migrate` |
| Services built before `f81cd73` | Stale runtime images | Rebuild API, web, worker, AI gateway, telephony-controller if source differs |
| `pjsip reload` transport staleness | Stage 7/8 SIP test flakes | Restart Asterisk only if tests fail with transport errors |

## External credential gate

When all repository work and contract tests pass but live credentials are absent:

```text
STATUS: BLOCKED_ON_EXTERNAL_CREDENTIALS
PRODUCTION_V1_EXTERNAL_GATE: READY_FOR_PLATFORM_OWNER_CONFIGURATION
```

Configure in **Platform Administration → Integrations** (OpenAI, SIP carrier, Stripe test mode).

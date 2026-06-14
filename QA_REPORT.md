# QA Report — PBX Final Closeout

**Date:** 2026-06-11
**Commit baseline:** `9a3e471` + live closeout session
**Status:** `BLOCKED_ON_EXTERNAL_CREDENTIALS` (foundation gate fixed; live integrations not configured in Platform Owner UI)

## Foundation gate (live closeout)

| Run | Command | Result | Duration |
|-----|---------|--------|----------|
| 1 | `make foundation-verify` | PASS (exit 0) | ~66s |
| 2 | `make foundation-verify` | PASS (exit 0) | ~68s |

Fix: bounded timeouts, non-interactive CI env, build output to `.local/foundation-verify/*.log` (prevents pipe stall), API smoke test reuses healthy API or starts bounded child only.

## Platform Owner integrations (Demo Company)

| Integration | Configured | Assignment |
|-------------|------------|------------|
| OpenAI | NO | — |
| SIP carrier | NO | — |
| Stripe TEST | NO | — |

`INTEGRATION_COUNT: 0` via `GET /api/v1/platform/integrations` as Platform Owner.

## Deterministic telephony and AI (Phase 3)

| Gate | Command | Result |
|------|---------|--------|
| Credential runtime contract | `make credential-runtime-contract-test` | PASS |
| Stage 7 SIP live | `bash scripts/stage7-sip-live-test.sh` | PASS |
| Stage 7 isolation | `bash scripts/stage7-isolation-test.sh` | PASS |
| Stage 7 verify | `bash scripts/stage7-verify.sh` | PASS |
| Stage 8 deterministic AI | `bash scripts/stage8-sip-ai-deterministic-test.sh` | PASS |
| Stage 8 barge-in + transfer 1002 | `bash scripts/stage8-sip-ai-behavior-test.sh` | PASS |

Evidence: extension registration, INVITE/180/200/ACK, RTP, call lifecycle, 2 legs, idempotent usage, cross-tenant denial, External Media, μ-law framing, barge-in, `transfer_call` to 1002, AI usage written.

## LAN softphone SIP bind fix (2026-06-11)

| Check | Command | Result |
|-------|---------|--------|
| Root cause confirmed | `git diff infrastructure/docker/docker-compose.telephony.yml` | SIP was `127.0.0.1:5062:5060/udp` (loopback-only) |
| Fix applied | `docker-compose.telephony.yml` | `${SIP_UDP_BIND:-0.0.0.0}:${SIP_UDP_PUBLISH:-5062}:5060/udp` |
| Compose validation | `docker compose -f docker-compose.yml -f docker-compose.telephony.yml config` | `0.0.0.0:5062 -> 5060/udp` |
| Regression guard | `bash scripts/validate-telephony-compose.sh` | PASS |
| Asterisk recreate | `docker compose ... up -d --force-recreate asterisk` | PASS (healthy) |
| Active mapping | `docker ps --filter name=pbx-asterisk` | `0.0.0.0:5062->5060/udp`; ARI `127.0.0.1:18088`; RTP `10000-10099` |
| Host listener | `sudo ss -lunp \| grep :5062` | `0.0.0.0:5062` |
| Asterisk transport | `pjsip show transports` | `0.0.0.0:5060` UDP |
| REGISTER proof (host) | SIPp → `127.0.0.1:5062` | `401` then `200 OK`; contact present in `pjsip show contacts` |
| External LAN softphone | Operator device retry | **Not performed** |
| Packet capture | `tcpdump` on UDP 5062 | **Not run** — `tcpdump` missing on host |

Status: `PASS_WITH_LIMITATIONS` — port publication and local registration verified; external-device LAN registration still needs operator confirmation.

## Extension provisioning + standard SIP port (2026-06-13)

| Check | Command | Result |
|-------|---------|--------|
| Root cause (no auto-provision) | audit `extension.created` vs `telephony.configuration.activate` for demo-company 1003 | create without activate |
| Root cause (render skip) | vitest DB probe | `demo-company_1001..1003` decrypt failure → excluded from PJSIP |
| Fix deployed | API auto-provision + reconcile/rotate | `bash scripts/reconcile-extension.sh demo-company 1003 true` → `provisioning_status=ready` |
| Generated config | `grep demo-company_1003 infrastructure/asterisk/generated/active/pjsip-tenants.conf` | endpoint/auth/aor present; `username=demo-company_1003` |
| Compose default | `bash scripts/validate-telephony-compose.sh` | host UDP `5060`; override `5062` OK |
| Asterisk mapping | `docker ps --filter name=pbx-asterisk` | `0.0.0.0:5060->5060/udp`; ARI loopback; RTP `10000-10099` |
| Runtime endpoint | `pjsip show endpoint demo-company_ext_1003` | endpoint + `InAuth: demo-company_1003_auth/demo-company_1003` |
| Regression tests | `@pbx/telephony-config test`, API telephony/extensions unit specs | PASS |
| External Zoiper REGISTER | Operator device | **Not performed** |

Status: `PASS_WITH_LIMITATIONS` — provisioning pipeline and runtime objects verified; external softphone registration not captured in this session. After reconcile with rotate, obtain the new one-time password via UI **Rotate credential and reconcile** (not logged in artifacts).

## Extension management UI (2026-06-13)

| Check | Command | Result |
|-------|---------|--------|
| API typecheck | `npx pnpm --filter @pbx/api run typecheck` | PASS |
| API unit tests | `npx pnpm --filter @pbx/api run test` | PASS (56 tests; includes recordings auth + extensions provisioning) |
| Web typecheck | `npx pnpm --filter @pbx/web exec tsc -p tsconfig.json --noEmit` | PASS |
| OpenAPI | `npx pnpm --filter @pbx/api run openapi:generate` | PASS (recordings + DELETE extension routes) |
| Recording capture | repo search `MixMonitor` / telephony upload | **Not implemented** — playback API only |
| Live rotate UI | Operator browser on extension detail | **Not performed** |
| Live Zoiper REGISTER after rotate | Operator softphone | **Not performed** |
| Live recording playback | Requires `call_recordings` row + MinIO object | **Not performed** (no seeded recordings) |
| Live delete + pjsip verify | Disposable test extension | **Not performed** |

Status: `PASS_WITH_LIMITATIONS` — code and unit tests pass; runtime UI/telephony evidence for rotate, playback, and delete requires operator session with live stack.

## Public SIP without VPN (2026-06-14)

| Check | Command | Result |
|-------|---------|--------|
| Go controller tests | `go test ./...` (telephony-controller) | PASS (includes `buildPjsipEndpointTarget`, call helper tests) |
| Telephony generator | `npx pnpm --filter @pbx/telephony-config test` | PASS (NAT-safe endpoint assertions) |
| Registration mapping | `vitest run registration-status.spec.ts` | PASS |
| Web typecheck | `npx pnpm --filter @pbx/web exec tsc --noEmit` | PASS |
| Transport public addresses | `pjsip show transport transport-udp` with `SIP_EXTERNAL_IP=46.120.0.73` | `external_signaling_address` / `external_media_address` = `46.120.0.73` |
| Generated NAT endpoints | `grep rewrite_contact active/pjsip-tenants.conf` | `rewrite_contact=yes`, `qualify_frequency=30` |
| Live endpoint | `pjsip show endpoint demo-company_ext_1003` | `rewrite_contact=true`, `force_rport=true`, `direct_media=false` |
| Batch registration API | `GET /api/v1/extensions/registration-status` | `asteriskReachable=true`; 1003/1004 `offline` (no contacts) |
| Activate + reconcile | `telephony/configuration/activate` + `reconcile-extension.sh` | PASS for 1003/1004 |
| Observed public IPv4 | `curl https://api.ipify.org` | `46.120.0.73` |
| Two-network REGISTER + bidirectional call | Operator phones (no VPN) | **Not performed** |

Status: `PASS_WITH_LIMITATIONS` — infrastructure and code fixes verified locally; independent-network registration, ringback, two-way audio, and hangup require operator execution from two external networks.

## Application and security (Phase 4)

| Gate | Command | Result |
|------|---------|--------|
| Database RLS integration | `RUN_INTEGRATION_TESTS=true pnpm --filter @pbx/database test` | PASS (10/10) |
| API integration | `RUN_INTEGRATION_TESTS=true pnpm --filter @pbx/api test:integration` | PASS (29/29) |
| Secret scan | `bash scripts/secret-scan.sh` | PASS |
| Deploy assets | `make deploy-validate` | PASS |
| AI gateway Go tests | `go test ./...` (Docker golang:1.24-alpine) | PASS |
| Telephony-controller Go tests | `go test ./...` (Docker) | PASS |

## External integration contracts (Phase 6)

| Gate | Command | Result |
|------|---------|--------|
| OpenAI contract | `make stage8-openai-contract-test` | PASS |
| PSTN config | `make pstn-config-validate` | PASS |
| Stripe contract | `make stripe-contract-test` | PASS |

## Live gates (Phase 7–8) — NOT RUN / BLOCKED

| Gate | Command | Result |
|------|---------|--------|
| OpenAI live | `make stage8-openai-live-test` | BLOCKED — `credentialSource=NOT_CONFIGURED` |
| PSTN outbound | `make pstn-outbound-test` | NOT_RUN — requires carrier credentials |
| PSTN inbound | `make pstn-inbound-test` | NOT_RUN — requires carrier credentials |
| Stripe test mode | `make stripe-test-mode-verify` | NOT_RUN — requires Stripe test credentials |
| Production-v1 verify | `make production-v1-verify` | NOT_RUN — depends on live gates |

Configure credentials in **Platform Administration → Integrations**. See [docs/INTEGRATION_CREDENTIAL_MANAGEMENT.md](docs/INTEGRATION_CREDENTIAL_MANAGEMENT.md).

## Documentation pointers

| Topic | Authoritative doc |
|-------|-------------------|
| Architecture | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Telephony | [docs/TELEPHONY_ARCHITECTURE.md](docs/TELEPHONY_ARCHITECTURE.md) |
| AI media | [docs/AI_MEDIA_ARCHITECTURE.md](docs/AI_MEDIA_ARCHITECTURE.md) |
| Credentials | [docs/INTEGRATION_CREDENTIAL_MANAGEMENT.md](docs/INTEGRATION_CREDENTIAL_MANAGEMENT.md) |
| Security | [docs/SECURITY_VERIFICATION.md](docs/SECURITY_VERIFICATION.md), [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) |
| Operations | [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md) |
| Gap matrix | [docs/CURRENT_GAP_MATRIX.md](docs/CURRENT_GAP_MATRIX.md) |

## Local call recording (2026-06-14)

| Check | Command | Result |
|-------|---------|--------|
| Policy resolver | `npx pnpm --filter @pbx/shared test` (`recording-policy.spec.ts`) | PASS (8 cases) |
| Go policy mirror | `go test ./...` (telephony-controller) | PASS |
| API typecheck | `npx pnpm --filter @pbx/api run typecheck` | PASS |
| Web typecheck | `npx pnpm --filter @pbx/web exec tsc --noEmit` | PASS |
| Storage safety | `local-recording-storage.service.spec.ts` | PASS (path containment, ranges) |
| Playback auth | `recordings.service.spec.ts` | PASS (human_agent, billing admin denied) |
| Migration 0009 | `pnpm db:migrate` | PASS (idempotent re-run) |
| Compose bind mount | `docker-compose.telephony.yml` | `CALL_RECORDING_LOCAL_ROOT` → host `var/recordings` |
| Controller capture | ARI `Bridge().Record` + finalize to opaque storage key | Code complete |
| Org settings API/UI | `PATCH tenants/:id/settings/telephony` | Code complete |
| Extension tri-state | `PATCH .../recording-policy` + effective display | Code complete |
| Call-details playback | `GET .../calls/:callId/recordings` + authenticated blob stream | Code complete |
| Live policy Test A (off) | `bash scripts/validate-call-recording.sh` | **Blocked** — SIPp callee contact `Unavail`; originate 500 |
| Live policy Test B (on) | same script | **Not reached** |
| Live audio capture | operator softphone 1003↔1004 | **Not performed** |
| Live browser playback | call-details `<audio>` | **Not performed** |
| Restart persistence | controller restart + file + playback | **Not performed** |

Status: `PASS_WITH_LIMITATIONS` — policy, storage, API, UI, and capture code verified by unit/type checks; live SIPp recording proof blocked by unreachable SIP contacts in this session (same root cause as failed `stage7-sip-live-test.sh` with host port 5060). Operator must verify with registered softphones: enable org recording or extension override, place answered call, confirm `call_recordings.status=available`, playback on call details, and file survives container recreate.

Validation script: `SIP_PORT=5060 bash scripts/validate-call-recording.sh`

## Git checkpoint (2026-06-14)

| Item | Value |
|------|-------|
| Branch | `feature/pbx-multitenant-closeout` |
| Checkpoint commit | `b726713` |
| Latest commit | `8f9e511` |
| Remote | `origin/feature/pbx-multitenant-closeout` (pushed) |
| Ahead/behind | `0 0` after checkpoint push |
| Excluded from commit | `.env`, generated `pjsip-tenants.conf` (passwords), `var/recordings/` |

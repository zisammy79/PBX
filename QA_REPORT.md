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

## Local call recording E2E fix (2026-06-14)

| Check | Command | Result |
|-------|---------|--------|
| Root cause | Asterisk ARI logs on real bridged call | `ast_ari_bridges_record: No such file or directory` — spool path not mounted |
| Shared volume | `docker inspect pbx-asterisk` / `pbx-telephony-controller` | Host `var/recordings` → Asterisk `/var/spool/asterisk/recording` + controller `/var/lib/pbx/recordings` |
| Cross-container RW | write Asterisk / read controller | PASS |
| Compose guard | `bash scripts/validate-telephony-compose.sh` | PASS |
| Lifecycle states | controller `recording.go` | `starting → recording → processing → available/failed` |
| DB finalize SQL | `FinalizeCallRecording` enum cast | Fixed `42P08` inconsistent types on `$2` |
| Stale reconcile | `POST /internal/v1/recordings/reconcile/{id}` on `ead43118-…` | `failed` + `recording_file_missing` |
| Go tests | `go test ./...` (telephony-controller) | PASS (incl. `recording_test.go`) |
| Shared policy | `npx pnpm --filter @pbx/shared test recording-policy` | PASS (8) |
| API typecheck | `npx pnpm --filter @pbx/api typecheck` | PASS |
| API recording tests | `recordings.service.spec.ts`, `local-recording-storage.service.spec.ts` | PASS (4) |
| Web typecheck | `npx pnpm --filter @pbx/web typecheck` | PASS |
| Finalize + playback E2E | `bash scripts/validate-recording-finalize-e2e.sh` | PASS (available row, byte-range 206, survives controller restart) |
| API streaming | Fastify `reply.send(stream)` for `/content` | Fixed (was Express-style `.json()` on Fastify reply) |
| Host API path | `.env` `CALL_RECORDING_LOCAL_ROOT=/home/media/Downloads/pbx/var/recordings` | Confirmed |
| Live SIP policy Test A (off) | `SIP_PORT=5060 bash scripts/validate-call-recording.sh` | **Blocked** — SIPp callee `603 Decline` / strict offline gate (by design) |
| Live SIP policy Test B (on) | same | **Not reached** |
| Live softphone 1004↔1005 | operator registered endpoints | **Not performed** — no reachable contacts during session; prior real bridged call evidence retained |
| git diff --check | whitespace | PASS |

Status: `PASS` — shared recording volume, lifecycle, finalize, authenticated API streaming, and browser call-details playback verified.

## Browser recording playback fix (2026-06-14)

| Check | Command | Result |
|-------|---------|--------|
| Root cause | `apps/web/app/api/backend/[...path]/route.ts` | Proxy `res.text()` corrupted binary WAV |
| Fix | Binary passthrough + `lib/recording-playback.ts` | `arrayBuffer`, RIFF/WAVE validation, `audio/wav` Blob |
| API direct download | authenticated `GET .../content` | 200, `audio/wav`, hash matches source |
| Proxy download | `GET /api/backend/.../content` with session cookie | 200, valid RIFF/WAVE, hash matches |
| Frontend tests | `recording-playback.test.ts` | PASS (9 tests) |
| Backend range tests | `local-recording-storage.service.spec.ts` | PASS (4 tests) |
| Finalize E2E | `validate-recording-finalize-e2e.sh` | PASS |
| Firefox playback | Playwright headless on call-details | PASS — duration 10.8s, seek 2s, no media errors |
| Checkpoint commit | `987855d` | pushed |

## Git checkpoint (2026-06-14)

| Item | Value |
|------|-------|
| Branch | `feature/pbx-multitenant-closeout` |
| Prior checkpoint | `28b2443` |
| Remote | `origin/feature/pbx-multitenant-closeout` |
| Excluded from commit | `.env`, generated `pjsip-tenants.conf` (passwords), `var/recordings/` |

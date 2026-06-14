# NOTES — PBX Final Closeout

**Reconciled:** 2026-06-11

## Stale review corrections

See [docs/CURRENT_GAP_MATRIX.md](docs/CURRENT_GAP_MATRIX.md). Human transfer, Git push, README, security/ops, and usage/rating claims from the stale review are **completed** — not blockers.

## Session fixes

- Integration tests: admin password resolution aligned with `scripts/lib/admin-credentials.sh` (`apps/api/src/integration/admin-auth.ts`).
- OpenAI contract test: validates inline `credentialsEncrypted` rejection and authorized session create (deferred credential resolution at media peer setup).
- `foundation-verify`: bounded timeouts + log files fix 35+ minute Next.js build stall (pipe backpressure when stdout captured).

## Runtime cautions

- PostgreSQL `max_connections` exhaustion can occur with multiple API dev instances; restart Postgres and terminate stale Node processes before long test suites.
- `make foundation-verify` full workspace build can be slow; `make stage7-verify` includes build + telephony regression.
- Local telephony SIP is published on `0.0.0.0:5062` by default (`SIP_UDP_BIND` / `SIP_UDP_PUBLISH` in `docker-compose.telephony.yml`). LAN softphones must target the PBX host LAN IP (example from 2026-06-11 session: `192.168.86.199`), not `127.0.0.1`.
- `bash scripts/validate-telephony-compose.sh` fails if SIP is rebound to loopback-only.

## LAN softphone SIP bind fix (2026-06-11)

| Check | Command | Result |
|-------|---------|--------|
| Compose source confirmed | `docker inspect pbx-asterisk` labels | `docker-compose.yml` + `docker-compose.telephony.yml` |
| Resolved mapping | `docker compose ... config` | `0.0.0.0:5062 -> 5060/udp`; ARI `127.0.0.1:18088`; RTP `10000-10099` |
| Regression guard | `bash scripts/validate-telephony-compose.sh` | PASS |
| Recreate Asterisk | `docker compose ... up -d --force-recreate asterisk` | PASS (healthy) |
| Docker ports | `docker ps --filter name=pbx-asterisk` | `0.0.0.0:5062->5060/udp` |
| Host listener | `sudo ss -lunp \| grep :5062` | `0.0.0.0:5062` (`docker-proxy`) |
| Asterisk transport | `pjsip show transports` | `0.0.0.0:5060` UDP |
| Local REGISTER proof | SIPp to `127.0.0.1:5062` | `401 Unauthorized` then `200 OK`; `pjsip show contacts` listed extension |
| External LAN softphone | Operator retry on separate device | **Not performed in this session** |
| Packet capture | `sudo timeout 60 tcpdump -ni any udp port 5062` | **Blocked** — `tcpdump` not installed on host |
| Host firewall | `ufw` / `firewalld` / `nft list ruleset` | No conclusive output before timeout; not disabled |

Hairpin note: SIPp REGISTER from the PBX host to its own LAN IP (`192.168.86.199:5062`) timed out with no SIP response. That is a common same-host hairpin limitation and is not treated as proof that external LAN clients cannot register.

## Extension provisioning + SIP onboarding (2026-06-13)

| Finding | Evidence |
|---------|----------|
| UI create did not activate telephony | `extension.created` for 1003 with no subsequent `telephony.configuration.activate` |
| demo-company creds skipped at render | Decrypt failed for `demo-company_1001..1003` with current `ENCRYPTION_MASTER_KEY` (silent skip in `loadTelephonyRecords`) |
| Fix | Auto `provisionGlobalConfiguration` after extension create; reconcile + rotate endpoints; `scripts/reconcile-extension.sh` |
| SIP port | Compose default host UDP `5060` (`SIP_UDP_PUBLISH` override validated) |
| Runtime after reconcile | `demo-company_1003` in active/staging PJSIP; `pjsip show endpoint demo-company_ext_1003`; auth `demo-company_1003` |
| External Zoiper REGISTER | **Not performed in this session** |

Softphone primary setup: **Username**, **Password**, **Domain** (`SIP_PUBLIC_DOMAIN` or public IPv4). Advanced: UDP, port 5060, auth username same as username, no outbound proxy.

## Public SIP without VPN (2026-06-14)

| Check | Command | Result |
|-------|---------|--------|
| Transport external addresses | `pjsip show transport transport-udp` after `SIP_EXTERNAL_IP=46.120.0.73` | `external_signaling_address` / `external_media_address` = `46.120.0.73` |
| Host ports | `docker ps --filter name=pbx-asterisk` | `0.0.0.0:5060/udp`, RTP `10000-10099`, ARI `127.0.0.1:18088` |
| NAT-safe endpoints | `grep rewrite_contact active/pjsip-tenants.conf` | `rewrite_contact=yes`, `qualify_frequency=30`, `remove_unavailable=yes` |
| Call sequencing fix | telephony-controller `onStasisStart` | caller ring before answer; bridge after callee Up |
| Registration API | `GET /api/v1/extensions/registration-status` | batch online/offline/unknown from ARI |
| Observed public IPv4 | `curl https://api.ipify.org` | `46.120.0.73` |
| `SIP_PUBLIC_DOMAIN` | `.env` | unset |
| Router WAN / port forward | operator | **Not confirmed** |
| Two-device external REGISTER + call | operator | **Not performed** |

Router forwarding required: WAN UDP `5060` and `10000-10099` → PBX host. CGNAT on WAN blocks inbound SIP unless PBX moves to a public host or ISP provides public IPv4.

Operator script: `bash scripts/check-extension-registration.sh demo-company 1003`

## Browser recording playback fix (2026-06-14)

| Finding | Evidence |
|---------|----------|
| Root cause | Next.js `/api/backend` proxy used `res.text()` for all responses, corrupting binary WAV |
| Fix | Proxy binary passthrough for `/recordings/*/content`; frontend `arrayBuffer` + RIFF/WAVE validation |
| API direct download | PASS — hash matches source WAV |
| Proxy download | PASS — hash matches source WAV |
| Firefox call-details Play | PASS — duration ~10.8s, seek to 2s, no `NS_ERROR_DOM_MEDIA_METADATA_ERR` |
| Checkpoint commit | `987855d` |

## Git checkpoint (2026-06-14)

Branch `feature/pbx-multitenant-closeout`, commit `28b2443` pushed to `origin`. Recording API module was previously gitignored by `recordings/` — fixed to `/recordings/` and `var/recordings/` only.

## Extension management UI (2026-06-13)

| Area | Implementation |
|------|----------------|
| Rotate credential | `POST .../rotate-credential` + detail UI `OneTimeSecretPanel`; password never returned on GET |
| Recordings list | `GET .../extensions/:id/recordings` joins `call_recordings` ↔ `calls` via `from_extension_id` / `to_extension_id` |
| Recording playback | `GET .../recordings/:id/play` → short-lived S3 presigned URL; `TENANT_RECORDING_READ` or `TENANT_EXTENSION_MANAGE` |
| Delete extension | `DELETE .../extensions/:id` → status `disabled`, credential revoked, `sip_registrations` cleared, global telephony reconcile |
| Recording capture | **Implemented** — ARI bridge recording, local disk via `CALL_RECORDING_LOCAL_ROOT`, metadata in `call_recordings`; live proof pending operator session |

## Local call recording (2026-06-14)

| Area | Implementation |
|------|----------------|
| Org default | `tenant_settings` key `telephony.recording` → `recordCallsByDefault` (default **off**) |
| Extension override | `extensions.recording_policy_mode` (`inherit` \| `on` \| `off`) |
| Effective policy | extension override wins; else org default; internal calls record if **any** participant effective-on |
| Capture | telephony-controller lifecycle `starting → recording → processing → available/failed`; ARI flat live name `{recordingUuid}.wav` under Asterisk spool; controller finalizes to opaque storage key |
| Storage | Shared host `var/recordings`: Asterisk `/var/spool/asterisk/recording`, controller `/var/lib/pbx/recordings`, host API `CALL_RECORDING_LOCAL_ROOT` |
| Stale repair | `POST /internal/v1/recordings/reconcile` or `bash scripts/reconcile-stale-recordings.sh [id]` |
| Live verification | `bash scripts/validate-recording-finalize-e2e.sh` PASS; full softphone capture requires registered 1004↔1005 (strict offline gate blocks SIPp) |

## Deferred

DigitalOcean deployment, HA, compliance — unchanged per [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md).

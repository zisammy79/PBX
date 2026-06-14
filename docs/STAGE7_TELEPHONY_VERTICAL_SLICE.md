# Stage 7 — Real Telephony Vertical Slice

**Date:** 2026-06-08  
**Status:** `STAGE7_STATUS: COMPLETE`

---

## Scope delivered

| Component | Path | Status |
|-----------|------|--------|
| Asterisk 20 runtime | `infrastructure/asterisk/` | Running |
| Telephony compose | `infrastructure/docker/docker-compose.telephony.yml` | Merged |
| Config generator | `packages/telephony-config/` | Active |
| Telephony controller | `services/telephony-controller/` | ARI connected |
| Calls / telephony API | `apps/api/src/modules/calls/`, `telephony/` | Exposed |
| Live SIP proof | `scripts/stage7-sip-live-test.sh` | PASS |
| Isolation / reliability | `scripts/stage7-isolation-test.sh` | PASS |

---

## Recovery note

Stage 7 resumed after a Cursor agent interrupt (`WritableIterable is closed`). Root cause for degraded Asterisk was Compose auto-binding `COPY config/` onto the base image `VOLUME /etc/asterisk`. Fix: overlay configs copied from `/opt/pbx-asterisk/overlay/` at entrypoint. See [STAGE7_RECOVERY_AUDIT.md](./STAGE7_RECOVERY_AUDIT.md).

---

## Asterisk runtime evidence

```text
ASTERISK_STATE: RUNNING_HEALTHY
```

| Probe | Result |
|-------|--------|
| `core show version` | Asterisk 20.19.0 |
| `module show like res_ari` | 12 modules loaded |
| `module show like chan_pjsip` | loaded |
| `http show status` | bound 0.0.0.0:8088, prefix `/asterisk` |
| `pjsip show transports` | `transport-udp` on 5060 |
| ARI `GET /asterisk/ari/asterisk/info` | 200 on host port 18088 |
| `/etc/asterisk` file count | ~114, `cdr.conf` present |

---

## PJSIP / SIP evidence

Configuration generator produces:

- Tenant-prefixed endpoint IDs (`{slug}_ext_{ext}`)
- SIP usernames as AOR names (REGISTER target)
- `identify` sections matching `From:` SIP username
- `realm=asterisk` on auth objects
- Stasis dialplan `Stasis(pbx-platform,{slug},${CALLERID(num)},${EXTEN})`

Live test (`scripts/stage7-sip-live-test.sh`):

```text
STAGE7_SIP_LIVE: PASS call_id=d969b696-0d0d-438b-b319-c702c68a452e events=3 legs=1 usage=1
```

- SIPp REGISTER for extension 1002: digest auth success
- SIPp INVITE 1001→1002: answered through Asterisk + Stasis
- Telephony-controller ARI WebSocket: `connected to asterisk ari`
- Stasis app `pbx-platform` handles call lifecycle

---

## Persistence evidence

| Table | Evidence |
|-------|----------|
| `calls` | Row with `caller_number=1001`, `callee_number=1002`, `status=completed` |
| `call_events` | ≥3 lifecycle events (CREATED, RINGING, COMPLETED) |
| `call_legs` | Caller leg recorded |
| `usage_events` | Exactly one row per call, key `internal_call:{callId}` |

Usage idempotency verified via `ON CONFLICT (idempotency_key) DO NOTHING` probe in `scripts/stage7-isolation-test.sh`.

---

## API evidence

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/telephony/configuration/activate` | Generates + reloads PJSIP/dialplan |
| `GET /api/v1/calls` | Lists persisted calls |
| `GET /api/v1/calls/active` | Active calls during ringing/answered |
| `GET /api/v1/calls/:id` | Call detail |
| `GET /api/v1/extensions/:id/registration` | Registration + ARI endpoint state |

---

## Tenant isolation

- Separate Asterisk contexts per tenant (`t_{slug}`)
- Duplicate extension numbers allowed across tenants (generator unit test)
- Cross-tenant API access covered by `apps/api/src/tenant-isolation.spec.ts`
- `scripts/stage7-isolation-test.sh`: `STAGE7_ISOLATION: PASS`

---

## Verification commands

```bash
# Live SIP + persistence
bash scripts/stage7-sip-live-test.sh

# Isolation + idempotency
bash scripts/stage7-isolation-test.sh

# Full gate (build, unit tests, telephony up, integration)
bash scripts/stage7-verify.sh
```

---

## Foundation regression

```text
pnpm test — PASS (2026-06-08)
```

Unit tests across `@pbx/telephony-config`, `@pbx/database`, `@pbx/api` pass. Integration tests skipped unless `RUN_INTEGRATION_TESTS=true`.

---

## Local softphone registration (same LAN)

Use a physical or virtual softphone on another device in the same LAN:

| Setting | Value |
|---------|-------|
| Username | `{tenant-slug}_{extension}` (example: `demo-company_1003`) |
| Password | One-time value from extension create or credential rotation |
| Domain | PBX LAN IP or `SIP_PUBLIC_DOMAIN` (example: `192.168.86.199`) — **no port suffix** |

Notes:

- Host-published SIP defaults to UDP **5060** (`SIP_UDP_PUBLISH`, Compose `docker-compose.telephony.yml`).
- Asterisk listens on UDP `5060` inside the container.
- Authentication username is the same as the SIP username.
- Disable DNS SRV and STUN for the initial same-LAN registration test.
- RTP media uses host UDP `10000-10099`.
- ARI remains private on loopback port `18088` (`127.0.0.1:18088`).

Advanced (optional in UI):

| Setting | Value |
|---------|-------|
| Transport | UDP |
| Port | 5060 |
| Authentication username | same as username |
| Outbound proxy | none |

Optional overrides:

```bash
SIP_UDP_BIND=0.0.0.0 SIP_UDP_PUBLISH=5060 SIP_PUBLIC_DOMAIN=192.168.86.199
```

Reconcile an existing extension after credential/key drift:

```bash
bash scripts/reconcile-extension.sh demo-company 1003 true
```

Regression checks:

```bash
bash scripts/validate-telephony-compose.sh
bash scripts/check-extension-registration.sh demo-company 1003
```

---

## Public SIP without VPN (roaming softphones)

Softphones on independent internet connections (cellular, home Wi-Fi, office Wi-Fi) use the same three fields:

| Setting | Value |
|---------|-------|
| Username | `{tenant-slug}_{extension}` |
| Password | One-time value from create or credential rotation |
| Domain | `SIP_PUBLIC_DOMAIN` or public IPv4 — **no port suffix** |

Environment (Asterisk container):

| Variable | Purpose |
|----------|---------|
| `SIP_PUBLIC_DOMAIN` | Default public hostname for Contact/SDP |
| `SIP_EXTERNAL_SIGNALING_ADDRESS` | Override signaling address |
| `SIP_EXTERNAL_MEDIA_ADDRESS` | Override RTP advertisement |
| `SIP_EXTERNAL_IP` | Legacy alias when separate addresses are not set |
| `SIP_UDP_PUBLISH` | Host-published UDP port (default 5060) |

Router / firewall (operator):

```text
WAN UDP 5060      → PBX host UDP 5060
WAN UDP 10000-10099 → PBX host UDP 10000-10099
```

Do **not** expose ARI (`8088`), telephony-controller (`8090`), AI gateway, PostgreSQL, Redis, or NATS.

CGNAT on the ISP WAN address blocks inbound SIP unless the PBX runs on a public cloud host or the ISP provides a routable public IPv4.

Registration runtime status in the UI/API is separate from provisioning **Ready**:

- **Ready** — PJSIP objects exist in active configuration
- **Online** — Asterisk reports a reachable contact for the endpoint
- **Offline** — Asterisk reachable, no contact
- **Unknown** — API cannot reach Asterisk ARI

Production should prefer TLS/SRTP; UDP remains supported for this MVP test path.

---

## Known limitations (Stage 7)

- No PSTN, WebRTC, AI media, or billing rating in this slice
- Live SIP proof requires Docker (SIPp image `pbertera/sipp`) and host UDP ports 5062 / 10000-10099
- `stage7-verify.sh` reprovisions a fresh tenant when `test:stage7` runs
- Asterisk container must be recreated (not only force-recreated) if a stale `/etc/asterisk` bind appears from prior compose experiments

---

## Safeguards confirmed

- [x] Real SIP signaling through Asterisk
- [x] PJSIP digest authentication (SIPp REGISTER/INVITE)
- [x] ARI / Stasis event handling
- [x] Database call persistence
- [x] Exactly one usage event per completed call
- [x] Cross-tenant isolation checks
- [x] Foundation unit test regression
- [x] No plaintext SIP secrets in repository (generated configs gitignored)

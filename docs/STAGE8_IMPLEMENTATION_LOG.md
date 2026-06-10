# Stage 8 Implementation Log

## Snapshot

| Field | Value |
|-------|-------|
| Created | 2026-06-08T16:11:28Z |
| Archive | `/home/media/Downloads/.pbx-snapshots/pbx-stage8-pre-20260608T161128Z/pbx-source.tar` |
| SHA256 | see `pbx-source.tar.sha256` in same directory |
| Excludes | `.env`, credentials, `node_modules`, `dist`, logs, DB/volume data, generated runtime configs |

## Status classification

```text
STAGE7_CLOSEOUT_GATE: PASS
STAGE8_IMPLEMENTATION_STATUS: IN_PROGRESS
STAGE8_EXTERNAL_TEST_STATUS: NOT_READY
```

Missing implementation (not credential-related): tenant AI APIs, agent versioning workflow, Asterisk AI route, media transport, OpenAI adapter, live SIP path, tools, transfer, deterministic E2E.

## Slice 8.1 — Reconciliation (2026-06-08)

### Existing usable implementation

| Area | State |
|------|-------|
| DB tables `ai_provider_connections`, `ai_agents`, `ai_agent_versions`, `ai_tools`, `ai_sessions`, `ai_usage` | Migrated in `0000`; **minimal columns only** |
| RLS on `ai_agents` | Present |
| `usage_events` with idempotency | Used by Stage 7 telephony |
| `packages/provider-sdk` | Interface stubs expanded |
| `services/ai-media-gateway` | Deterministic provider + health + isolated conversation test |
| `TENANT_AI_MANAGE` permission | Present (coarse) |
| Telephony config generator | Extension dialplan + PJSIP only |
| Telephony controller | Internal + join legs; **no AI path** |
| Asterisk 20.19.0 + `chan_websocket.so` | Loaded |

### Placeholders / incomplete

| Area | Gap |
|------|-----|
| `ai_provider_connections` | No key version, validation fields, created_by |
| `ai_agents` | No route_number, transfer_extension_id, status, created_by |
| `ai_agent_versions` | Config JSONB only; no structured immutable fields |
| `ai_sessions` | Minimal status enum; no correlation, provider session, diagnostics timing |
| `ai_usage` | No idempotency_key, measurement_source |
| RLS | Missing on provider_connections, agent_versions, sessions, usage, tools |
| NestJS `/api/v1/ai/*` | **Not implemented** |
| OpenAPI AI paths | **Not implemented** |
| Asterisk AI dialplan | **Not generated** |
| Media transport | **Not selected/implemented** |
| OpenAI Realtime adapter | **Not implemented** |
| Deterministic SIP E2E | **Not implemented** (gateway-only test exists) |

### Design notes

- Deterministic provider is test-only; live path uses separate OpenAI adapter behind `RealtimeVoiceProvider`.
- Do not duplicate tables; extend existing `ai_*` schema via `0002_stage8_ai.sql`.
- Prefer `chan_websocket` (Asterisk 20.19.0) over External Media unless probe fails.

## Slice progress

| Slice | Status | Notes |
|-------|--------|-------|
| 8.1 Reconciliation | DONE | This document |
| 8.2 DB + RLS | IN_PROGRESS | |
| 8.3 Permissions + APIs | PENDING | |
| 8.4 Credentials | PENDING | |
| 8.5 Media probe | DONE | chan_websocket available |
| 8.6 Asterisk AI route | DONE | Tenant route `8999` → Stasis `ai` args |
| 8.7 Gateway session mgr | DONE | `/internal/v1/sessions`, RTP bridge, deterministic provider |
| 8.8 Deterministic SIP External Media E2E | DONE | `scripts/stage8-sip-ai-deterministic-test.sh` PASS |
| 8.9 Deterministic realtime (barge-in, tools, transfer) | DONE | See Slice 8.9 below |
| 8.10 OpenAI adapter | PENDING | |
| 8.13–8.15 Sessions/usage/det E2E | PARTIAL | AI session diagnostics persisted; normalized usage deferred |
| 8.16 Credential gate | PENDING | |

## Slice 8.8 — Deterministic SIP-to-AI External Media proof (2026-06-09)

### Session JSON contract

Telephony controller `gatewaySessionRequest` and gateway `session.CreateRequest` share lower-camel-case tags (`sessionId`, `tenantId`, `callId`, `correlationId`, `agentId`, `agentVersionId`, `provider`, `audioFormat`, …). Contract tests: `services/ai-media-gateway/internal/session/contract_test.go`.

### Asterisk / External Media

| Item | Value |
|------|-------|
| Asterisk | 20.19.0 |
| Transport | ARI External Media RTP (`connection_type=client`, `format=ulaw`, `encapsulation=rtp`) |
| Bridge | Mixing bridge; caller PJSIP + UnicastRTP external media |
| Gateway RTP | Bind `0.0.0.0`; advertise `ai-media-gateway` (`172.25.0.8`) on `pbx-internal` |
| Asterisk peer | `UNICASTRTP_LOCAL_ADDRESS/PORT` → gateway `/peer` notify |

### Bidirectional media evidence (2026-06-09)

Session `bbffb50d-0b65-456e-b4f9-8b144a4e4229`, call `417d9c72-588d-48cf-ad78-c77610f4686d`:

```json
{
  "rtpPacketsReceived": 296,
  "rtpBytesReceived": 94720,
  "rtpPacketsSent": 495,
  "rtpBytesSent": 158400,
  "firstInboundMediaMs": 74,
  "firstOutboundMediaMs": 73,
  "codec": "ulaw"
}
```

`STAGE8_DETERMINISTIC_SIP_AI: PASS` — Stage 7 live SIP + tenant isolation regressions PASS in same run.

### Fixes applied this slice

1. **Bridge membership idempotency** — `markAnsweredAndBridged` no longer re-adds channels already in the mixing bridge (eliminated leave/rejoin churn).
2. **SIPp on Docker network** — Stage 8 test runs SIPp on `pbx-internal` targeting `asterisk:5060` so RTP addresses are reachable from Asterisk (host-network `127.0.0.1` SDP broke caller-side RTP).
3. **JSON contract** — Explicit tags + validation on gateway session create; controller aligned.

### Remaining Stage 8 work

- OpenAI Realtime adapter and tenant AI management APIs
- Normalized `ai_usage` events and billing (invoice/charge calc)
- PSTN / WebRTC / frontend

## Slice 8.9 — Outbound SIP human transfer (2026-06-09)

### Root cause

Outbound INVITE failures were **not** caused by missing endpoint/AoR configuration. Asterisk sent INVITEs to the registered contact; failures were in the **SIPp test harness** and **usage timing**:

1. **Combined `register-uas-answer.xml`** — REGISTER and UAS in one scenario caused SIPp to discard inbound INVITEs as out-of-call.
2. **Split register + UAS containers** — ephemeral REGISTER container IP could differ from the UAS listener IP, leaving a stale contact.
3. **`pjsip reload` transport staleness** — after repeated reloads, PJSIP logged `PJSIP_ETPNOTAVAIL`; full Asterisk restart clears transport.
4. **Contact hygiene** (preserved) — `max_contacts=1`, `rewrite_contact=no`, `remove_existing=yes`; avoid host-network SIPp polluting AoR.
5. **Gateway closed before usage stats** — deferred `closeGatewaySession` until after `recordAiUsage`.

### Active Asterisk configuration (verified)

| Check | Value |
|-------|-------|
| Endpoint | `stage7-1780899388_ext_1002` |
| AoR | `stage7-1780899388_1002` |
| Contact | `sip:stage7-1780899388_1002@172.25.0.9:5072` (count=1) |
| `rewrite_contact` | `no` |
| `max_contacts` | `1` |
| Transport | `transport-udp` `0.0.0.0:5060`, `local_net=172.25.0.0/16` |

### Dial path evidence

| Layer | Result |
|-------|--------|
| Endpoint/AoR dial | INVITE → 180 → 200 → ACK |
| Standalone ARI originate | `STAGE8_STANDALONE_ORIGINATE: PASS` |
| AI `transfer_call` | `TRANSFERRED`, human leg, bridge, usage=4 |

### SIPp harness

Single container: `register-exit.xml` then `exec uas-answer.xml` on same IP:port.

### Regression (2026-06-09)

- `STAGE8_DETERMINISTIC_BEHAVIOR: PASS`
- `STAGE7_SIP_LIVE: PASS`
- `STAGE7_ISOLATION: PASS`

# AI Media Architecture

## Provider abstraction

```text
RealtimeVoiceProvider
SpeechToTextProvider
LanguageModelProvider
TextToSpeechProvider
EmbeddingProvider
KnowledgeProvider
ToolProvider
```

Each adapter exposes a capability manifest: audio formats, sample rates, interruption support, session limits, pricing metadata, health status.

## Pipeline modes

### Native realtime (priority)

OpenAI Realtime, Google Gemini Live — direct WebSocket audio via AI Media Gateway (Go).

### Cascaded pipeline

```text
Caller audio → normalize → VAD → STT → LLM → tools → TTS → caller audio
```

Vendor-neutral with primary/fallback providers, circuit breakers, and tenant quotas.

## AI Media Gateway responsibilities

- Bidirectional streaming with Asterisk External Media / chan_websocket
- G.711 µ-law/A-law, linear PCM, Opus transcoding
- Jitter handling, VAD, barge-in, response cancellation
- Per-stage latency timestamps exposed in call diagnostics
- Clean transfer and hangup

### Human transfer (Slice 8.9)

On `transfer_call`:

1. Detach External Media from mixing bridge; hang up AI media channel
2. ARI originate to human extension endpoint (`PJSIP/{tenant}_ext_{ext}`)
3. Human channel enters Stasis with `join,{callId}`; bridge caller + human
4. Fetch gateway RTP stats, write idempotent `ai_usage` meters, then close gateway session
5. Persist `TRANSFERRED` / human call leg

SIPp proof uses **register-then-UAS in one Docker container** on `pbx-internal` so the REGISTER Contact IP matches the UAS listener (avoid stale contacts from host-network or ephemeral register containers).

## Tool execution

Tenant-scoped tools with JSON schema, timeouts, auth config, audit logging, secret redaction, optional human approval, idempotency keys.

## Security

- Provider credentials encrypted at rest (envelope encryption)
- Prompt injection mitigations documented in THREAT_MODEL.md
- Cost ceilings and spending limits per agent/tenant

## Runtime credential resolution

External runtime credentials are resolved at session creation by the AI media gateway via the internal integration resolver (`POST /api/v1/internal/integrations/resolve`). The telephony controller never passes plaintext or encrypted credentials in session requests.

```text
Telephony controller (trusted session state: tenantId, provider)
  → AI media gateway /internal/v1/sessions
  → API internal integration resolve (INTERNAL_SERVICE_TOKEN)
  → decrypted credential in gateway process memory only
  → OpenAI Realtime WebSocket adapter
```

Secrets must not appear in ARI appArgs, NATS events, logs, or session diagnostics. Sanitized metadata includes `integrationId`, `credentialSource`, and `credentialVersion`. Active sessions pin the credential version they started with; rotation applies to new sessions only.

## Foundation stage status

Interface definitions and database schema (`ai_agents`, `ai_agent_versions`, `ai_sessions`, etc.) are in place. Go gateway service handles deterministic External Media sessions and OpenAI Realtime via runtime credential resolution.

## External Media RTP flow (implemented)

```text
Caller RTP (ulaw) → Asterisk PJSIP → mixing bridge → UnicastRTP
  → UDP to ai-media-gateway:{port} (client mode external_host)

Gateway deterministic provider → ulaw RTP → UNICASTRTP_LOCAL peer → bridge → caller
```

- Codec: G.711 µ-law (`ulaw`), 20 ms frames (160 bytes payload target)
- Docker network: `pbx-internal` (Asterisk `172.25.0.6`, gateway `172.25.0.8`)
- Session create contract: JSON POST `/internal/v1/sessions` with `sessionId`, `tenantId`, `callId`, `correlationId`, `provider`, `audioFormat`
- Peer notify: POST `/internal/v1/sessions/{id}/peer` with `asteriskMediaAddress`
- Stats: GET `/internal/v1/sessions/{id}/stats` (live); persisted under `ai_sessions.diagnostics.media` on hangup

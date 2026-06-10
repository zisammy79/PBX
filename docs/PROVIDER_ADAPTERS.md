# Provider Adapters

## SIP

Generic `SipTrunk` model supports any standards-compatible provider. Optional `SipProviderAdapter` for API automation.

### Planned adapters

Twilio, Telnyx, Bandwidth, Vonage, Plivo, SignalWire, generic SIP.

### Generic adapter capabilities

Registration, IP auth, username/password, transport selection, codec preferences, DTMF mode, caller-ID, custom headers, DID matching, failover, OPTIONS health checks, CPS/concurrency limits.

**Status:** Schema and config JSON fields in place. Adapters not implemented.

## AI

See [AI_MEDIA_ARCHITECTURE.md](./AI_MEDIA_ARCHITECTURE.md).

### Realtime voice (priority)

- OpenAI Realtime — runtime credential resolution via AI media gateway + internal integration resolver
- Google Gemini Live (planned)

**Status:** OpenAI Realtime wired with runtime resolver; Gemini not implemented.

### Cascaded pipeline providers

LLM, STT, TTS adapters as listed in product requirements.

**Status:** Interface definitions planned in `packages/provider-sdk` (Stage 8).

## Billing

`BillingProviderAdapter` with Stripe as first implementation.

**Status:** Schema only.

## Certification rule

A provider is not marked supported until contract test or documented manual configuration is complete.

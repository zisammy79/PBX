# Production V1 Closeout Plan

**Program:** PBX Production-v1 Closeout  
**Baseline:** Non-AI platform complete (`READY_FOR_CONTROLLED_STAGING_DEPLOYMENT`)  
**Target:** `PRODUCTION_V1_READINESS: READY_FOR_CONTROLLED_PRODUCTION_DEPLOYMENT`

## Authoritative baseline (unchanged)

| Status | Value |
|--------|-------|
| LOCAL_DEMO | PASS |
| NON_AI_IMPLEMENTATION | COMPLETE |
| DETERMINISTIC_AI | PASS |
| BARGE_IN_AND_TRANSFER | PASS |
| TENANT_ISOLATION | PASS |
| SECURITY_VERIFICATION | PASS |
| DEPLOYMENT_ASSETS | PASS |
| DIGITALOCEAN_DEPLOYMENT | NOT_PERFORMED |
| HIGH_AVAILABILITY | NOT_IMPLEMENTED |
| COMPLIANCE_CERTIFICATION | NOT_PERFORMED |

## P0 — required before controlled production deployment

| # | Work item | Owner slice | Verification |
|---|-----------|-------------|--------------|
| 1 | OpenAI Realtime live adapter (single external provider) | Stage 8 / AI gateway | `make stage8-openai-contract-test`, `make stage8-openai-live-test` |
| 2 | One real SIP carrier / PSTN path (generic trunk model) | Stage 7 / telephony-config | `make pstn-config-validate`, `make pstn-outbound-test`, `make pstn-inbound-test` |
| 3 | Stripe test-mode payment lifecycle (ledger remains source of truth) | Billing | `make stripe-contract-test`, `make stripe-test-mode-verify` |
| 4 | Production configuration safeguards | Ops / API config | `scripts/validate-production-safeguards.sh` |
| 5 | Full end-to-end regression and release artifacts | Slice H extension | `make production-v1-verify` |

### P0 exclusions (explicitly deferred)

- High availability / multi-region
- Additional AI providers (Gemini, Azure, Anthropic live)
- Multiple carrier-specific adapters
- WebRTC / TURN
- Compliance certification (SOC2, PCI)
- Kamailio / RTPengine
- DigitalOcean apply / paid resource creation

## P1 — post-launch improvement

- Rating engine Go service (full rating offload from API)
- Provider cost reconciliation from carrier CDRs
- TOTP MFA endpoints
- Support-session impersonation UI
- Additional SIP carrier adapters (Twilio, Telnyx automation)
- Prometheus optional exporter bundles
- Spaces backup upload automation

## P2 — scale, certification, or compliance work

- Multi-node HA and autoscaling
- WebRTC softphone
- Emergency calling (E911)
- PCI / SOC2 certification programs
- Multi-region Terraform
- Kamailio SBC layer
- RTPengine media anchoring at scale

## Implementation map

### OpenAI Realtime (P0.1)

- Reuse: `RealtimeVoiceProvider` contract, Asterisk External Media, AI media gateway, G.711 μ-law, barge-in, tools, transfer, session diagnostics, usage metering
- Add: `services/ai-media-gateway/internal/provider/openai_realtime.go`
- Preserve: deterministic provider unchanged; selectable per tenant agent
- Credentials: tenant-scoped encrypted API key via `ai_provider_connections`; never returned after create
- Configurable: model, voice, realtime URL via env / connection config — no hard-coded secrets

### SIP carrier / PSTN (P0.2)

- Reuse: generic `sip_trunks` schema, tenant isolation, usage events, call persistence
- Add: trunk config generator, PSTN API module, fraud controls (concurrency, duration, spend, destination restrictions)
- One standards-compatible carrier via registration or IP auth — no multi-adapter framework in P0

### Stripe test mode (P0.3)

- Reuse: internal ledger, invoices, subscriptions schema
- Add: Stripe customer/subscription/invoice mapping, webhook handler with signature verification and idempotency
- Test mode only; live keys rejected; UI shows "Stripe test mode"

### Production safeguards (P0.4)

- Demo seed disabled in production
- Deterministic AI not default in production templates
- No demo tenant in production migrations
- No SIPp in production Compose
- Encrypted/redacted provider secrets
- Emergency calling disabled; recording disabled until tenant policy set
- Destination and spend limits enabled
- CORS, cookies, internal ports validated

## Milestone gates

| Progress | Milestone | Gate |
|----------|-----------|------|
| 20% | Remaining production gaps reconciled | This document approved |
| 40% | OpenAI Realtime implementation ready | Contract tests pass; live test script present |
| 60% | SIP carrier and PSTN implementation ready | Config validation passes; live harness present |
| 72% | Stripe test-mode implementation ready | Contract tests pass; verify script present |
| 82% | Production safeguards complete | Safeguard script pass |
| 92% | Live integration verification complete | All three live tests pass with local secrets |
| 100% | Production-v1 release ready | Full regression + artifacts |

## External credential gate

When non-secret implementation and contract tests pass, deployment requires local secrets only:

```
PRODUCTION_V1_EXTERNAL_GATE: READY_FOR_LOCAL_SECRETS
```

See `scripts/setup-production-secrets.sh` and tenant administration UI for secure local configuration. Do not paste secrets into chat or commit them to the repository.

## Release artifacts (P0.5)

- `docs/PRODUCTION_V1_FINAL_EVIDENCE.md`
- `docs/PRODUCTION_V1_RELEASE_READINESS.md`
- `docs/PRODUCTION_V1_RELEASE_NOTES.md`
- `docs/PRODUCTION_V1_ARTIFACT_MANIFEST.json`
- `docs/PRODUCTION_V1_OPERATIONS_CHECKLIST.md`
- Source archive under `/home/media/Downloads/.pbx-releases/`

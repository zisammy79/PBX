# Known Limitations

## Platform

- **Single-node deployment** — no HA, no autoscaling (Slice G)
- **DIGITALOCEAN_DEPLOYMENT: NOT_PERFORMED** — assets only
- External AI: **DEFERRED / NOT_TESTED**
- Stripe: **DISABLED**
- WebRTC / TURN: **DEFERRED**
- Emergency calling: **NOT ENABLED**
- PSTN production verification: **NOT PERFORMED**

## Telephony

- Deterministic SIP-to-AI path proven locally; OpenAI Realtime not integrated
- Stage 8 SIP proof requires SIPp on Docker network `pbx-internal`
- `pjsip reload` during tests can leave UDP transport unavailable
- Production RTP range fixed at 10000–10099 for initial deployment

## Billing / rating

- Rating engine Go service is health-only; rating runs in API
- Provider cost always UNAVAILABLE in UI

## Operations

- Prometheus scrapes some optional exporters (postgres/node) — deploy exporters separately
- Backup upload to Spaces requires operator credentials configuration
- Ansible syntax check may use YAML fallback when ansible-playbook unavailable

## UI / API

- TOTP MFA schema present but endpoint not implemented
- Support-session impersonation UI unavailable

See [ROADMAP.md](./ROADMAP.md) for planned follow-on slices.

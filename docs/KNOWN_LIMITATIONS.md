# Known Limitations

## Platform

- **Single-node deployment** — no HA, no autoscaling (Slice G)
- **DIGITALOCEAN_DEPLOYMENT: NOT_PERFORMED** — assets only
- External AI: **OpenAI Realtime implemented** — live verification **NOT_TESTED** without credentials
- Stripe: **TEST MODE IMPLEMENTED** — live verification **NOT_TESTED** without credentials
- PSTN: **generic trunk path implemented** — production verification **NOT_PERFORMED** without carrier credentials

## Telephony

- Deterministic SIP-to-AI path proven locally; **OpenAI Realtime adapter implemented** — live verification requires local `OPENAI_API_KEY`
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

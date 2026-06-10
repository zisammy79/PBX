# Product Requirements

## Vision

A multi-tenant virtual PBX SaaS platform enabling a platform operator to serve many business customers from shared infrastructure with strong tenant isolation, real telephony, realtime AI voice agents, usage metering, and billing.

## Personas

| Persona | Goals |
|---------|-------|
| Platform super administrator | Provision tenants, monitor health, revenue, margin |
| Platform support operator | Time-limited audited tenant access |
| Tenant owner | Configure PBX, users, numbers, AI agents |
| Tenant administrator | Manage extensions, call flows, trunks |
| Human agent | Handle calls, voicemail |
| API integrator | Automate via REST API and webhooks |

## MVP vertical slice (Stage 7–9)

The first production milestone proves:

1. Platform admin authentication and tenant provisioning
2. Extension provisioning with secure SIP credentials
3. Live extension-to-extension call via Asterisk
4. Active call visibility and CDR/usage events
5. Generic SIP trunk with connection test
6. AI voice agent with bidirectional audio and transfer
7. Usage metering, rating, and signed webhooks

## Out of scope for foundation

- Visual call-flow editor (typed model first)
- Advanced queues, conferencing, fax
- Stripe live integration (adapter interface defined)
- Kamailio/RTPengine scale-out (documented only)
- Emergency calling (disabled by default)

## Success criteria

- One tenant cannot access another tenant's resources (tested)
- Real SIP call path with supplied credentials
- Real AI provider connection with supplied credentials
- Immutable usage ledger separate from CDR
- Repeatable local and DigitalOcean deployment

See [ROADMAP.md](./ROADMAP.md) for phased delivery.

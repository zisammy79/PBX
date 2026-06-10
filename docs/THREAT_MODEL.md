# Threat Model

## Scope

Multi-tenant virtual PBX with SIP, WebRTC, REST API, AI agents, billing, and object storage.

## Assets

- Tenant call data, recordings, transcripts
- SIP credentials and API keys
- AI and carrier provider credentials
- Usage/billing ledger
- Platform operator access

## Threats and mitigations

| Threat | Impact | Mitigation | Stage |
|--------|--------|------------|-------|
| SIP credential theft | Toll fraud | Strong generated secrets, TLS/SRTP, registration limits | 7 |
| Toll fraud | Financial | CPS limits, spend caps, geo allowlists, fail2ban | 7 |
| Brute-force registration | DoS/fraud | Rate limits, fail2ban, IP reputation hooks | 7 |
| Cross-tenant API access | Data breach | TenantGuard, service scoping, RLS, tests | 1 ✓ |
| API key leakage | Unauthorized API | Hashed keys, rotation, revocation | 6 |
| AI key leakage | Cost/abuse | Envelope encryption, never return plaintext | 1 ✓ |
| Recording leakage | Privacy | Signed expiring URLs, access audit | 9 |
| Prompt injection | Data exfil | Tool scoping, approval gates, logging | 8 |
| Malicious tool calls | SSRF/data loss | URL allowlists, timeouts, audit | 8 |
| Webhook forgery | False events | HMAC signatures, replay protection | 9 |
| SSRF via webhooks/tools | Internal access | Egress controls, block RFC1918 | 8 |
| RTP flooding | DoS | Firewall, rate limits | 7 |
| Support impersonation abuse | Privacy | Audited sessions, UI indicator, TTL | 6 |
| Log credential leakage | Exposure | Secret redaction in `@pbx/shared` | 1 ✓ |

## Defaults

- Emergency calling: **disabled** until explicitly configured
- Call recording: **disabled** until consent policy selected
- ARI/AMI/DB/Redis/NATS: **not publicly exposed**

## Compliance note

This document describes readiness controls. GDPR, HIPAA, PCI DSS, and SOC 2 certification are **not claimed**.

## Foundation stage

Authentication, tenant isolation, encrypted credential storage, and correlation IDs are implemented. Telephony-specific controls pending Stage 7.

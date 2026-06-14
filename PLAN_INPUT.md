# PLAN_INPUT — PBX multi-tenant closeout

**Approved:** 2026-06-14

## Mission

Complete the PBX multi-tenant management layer: customer lifecycle, portal users/invitations, SIP devices, tenant SIP domains, entitlements, and Platform Owner / tenant-admin UI — without interrupting working telephony.

## Capability matrix (2026-06-14 review)

| Capability | DB | API | UI | Auth | Runtime | Tests | Status | Missing work |
|------------|----|-----|----|----|---------|-------|--------|--------------|
| Tenant list/create | IMPLEMENTED | IMPLEMENTED | PARTIAL | IMPLEMENTED | IMPLEMENTED | PARTIAL | PARTIAL | Wizard provisioning orchestration |
| Customer summary dashboard | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | PARTIAL | PARTIAL | Primary owner, SIP mode columns |
| Lifecycle states (draft→archived) | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | PARTIAL | IMPLEMENTED | PARTIAL | Suspend blocks SIP at auth layer (future) |
| Lifecycle transition validation | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | — |
| Portal users / memberships | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | PARTIAL | MISSING | PARTIAL | Extension assign/unassign API |
| Secure invitations | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | PARTIAL | MISSING | PARTIAL | Email provider (external) |
| SIP devices schema | IMPLEMENTED | IMPLEMENTED | PARTIAL | IMPLEMENTED | PARTIAL | MISSING | PARTIAL | Multi-device ring in controller |
| Legacy device backfill | IMPLEMENTED | IMPLEMENTED | N/A | N/A | PARTIAL | MISSING | PARTIAL | Run backfill after migrate |
| Tenant SIP domains | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | EXTERNAL | MISSING | PARTIAL | Live DNS delegation |
| Shared-domain compatibility | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | — |
| Extension limits | IMPLEMENTED | IMPLEMENTED | MISSING | IMPLEMENTED | PARTIAL | PARTIAL | PARTIAL | UI entitlement counters |
| Multi-dimension entitlements | IMPLEMENTED | PARTIAL | MISSING | IMPLEMENTED | PARTIAL | MISSING | PARTIAL | Enforce calls/PSTN/AI dims |
| Platform customer UI | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | IMPLEMENTED | PARTIAL | MISSING | PARTIAL | Detail tabs reuse |
| Tenant admin UI | IMPLEMENTED | PARTIAL | PARTIAL | IMPLEMENTED | PARTIAL | MISSING | PARTIAL | Devices list page, settings nav |
| Audit events | IMPLEMENTED | IMPLEMENTED | PARTIAL | IMPLEMENTED | IMPLEMENTED | MISSING | PARTIAL | Dedicated audit tab |
| Telephony regression | N/A | N/A | N/A | N/A | IMPLEMENTED | PARTIAL | PASS_WITH_LIMITATIONS | Live two-device gate pending |

## Compatibility constraints

- Preserve existing extension credentials as legacy/default devices
- Preserve shared-domain username format `{slug}_{ext}`
- Additive migration `0012_multitenant_closeout` only
- Grandfathered over-limit tenants: existing objects operate; new creates blocked
- Do not manually edit active generated Asterisk config

## Prior extension-management mission (2026-06-13)

See prior sections in git history — rotate credential, recordings playback, safe delete remain IMPLEMENTED.

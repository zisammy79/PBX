# PLAN_INPUT — PBX multi-tenant closeout (residual matrix)

**Approved:** 2026-06-15
**Baseline commit:** `5e80d73`
**Branch:** `feature/pbx-multitenant-closeout`

## Residual gap matrix (post-5e80d73)

| Gap | Current implementation | Missing runtime behavior | Files/symbols | Compatibility constraint | Tests required | Live evidence required |
|-----|------------------------|------------------------|---------------|--------------------------|----------------|------------------------|
| Lifecycle telephony enforcement | `TenantLifecycleTelephonyService`, `TenantGuard` blocks suspended/archived portal | Live REGISTER/call denial on suspended tenant | `tenant-lifecycle-telephony.service.ts`, `tenants.service.ts`, `tenant.guard.ts`, `generator.ts` (active-only) | Rollback on telephony failure; history preserved | Lifecycle + rollback unit tests | Suspend API → config absent → reactivate same creds (**suspend/reactivate API proven 2026-06-15**) |
| Customer PBX provisioning | `TenantProvisioningService`, `/platform/tenants/[id]/provision` | End-to-end browser wizard proof | `tenant-provisioning.service.ts`, `tenants.controller.ts`, provision page | Idempotent retry; not `active` before runtime verify | Provisioning integration test | UI draft→provision→active with endpoint verify |
| Invitation acceptance UI | `accept-invitation/page.tsx`, memberships API | Browser accept + expire/revoke/replay | `memberships.service.ts`, accept page | Token hash-only; copy-link when SMTP missing | Invitation API + browser test | Copy-link + accept session |
| Multi-device ringing | Controller multi-originate + `cancelOtherCalleeLegs`, `ListCalleeEndpointsForExtension` | Two softphones live first-answer-wins | `controller.go`, `repository.go`, `registry.go` | Legacy endpoint fallback; offline gate preserved | Go unit tests (host lacks `go`) | Two-device REGISTER + call |
| Tenant SIP domains | TXT validation APIs + telephony settings UI | Live DNS delegation proof | `sip-domains.service.ts` | Shared-domain login preserved | Resolver unit tests | External DNS (blocked if undelegated) |
| Entitlement enforcement | `TenantLimitsService` + concurrent calls in controller `CreateCall` | Race integration tests; recording storage gate | `tenant-limits.service.ts`, `repository.go` | Grandfather over-limit; unlimited when unset | Concurrent race integration | UI counters match API |
| Five-tenant isolation | `demo:multitenant-seed`, guard tests | Cross-tenant API integration suite | `multitenant-demo-seed.ts`, `tenant-isolation.spec.ts` | No secrets in repo | API isolation integration | Tenant A cannot access B resources |
| Generated Asterisk secrets in git | `.gitignore` for credential-bearing conf | Migrate to ignored runtime dir | `infrastructure/asterisk/generated/*` | Do not break active mount | N/A | Working tree remains dirty (not committed) |
| Live telephony regression | Stage7 scripts | stage7-sip-live-test REGISTER failed (stage7 tenant creds) | `scripts/stage7-*.sh` | Preserve ringback/recording pipeline | stage7-verify | Mandatory regression partially blocked |

## Reused from 5e80d73 (do not replace)

- Migration `0012_multitenant_closeout.sql`, contracts, memberships/devices/sip-domains modules
- Platform customers list, tenant users invite UI, extension devices panel (partial)
- Entitlement dimensions schema and partial `TenantLimitsService`
- Telephony `loadTelephonyRecords()` device-first with legacy fallback

## Definition of Done status

**Overall:** `PASS_WITH_LIMITATIONS` — stage7 live SIP regression PASS; lifecycle suspend/reactivate PASS; invitation API and entitlement race PASS; multi-device live and browser wizard proofs remain open.

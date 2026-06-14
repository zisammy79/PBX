# PLAN_INPUT — Extension management UI

**Approved:** 2026-06-13

## Mission

Complete the extension detail/list experience: rotate SIP credentials, list/play recorded calls, and safely delete extensions while preserving history.

## Scope

- Rotate credential action with one-time password display and provisioning reconcile
- Recorded calls panel on extension detail (list + authorized playback)
- Delete extension (logical disable + telephony removal + credential revocation)
- Server-side authorization for all mutating actions
- Provisioning states: pending, provisioning, ready, failed, deleting, deleted

## Out of scope

- Call recording capture pipeline (MixMonitor / upload workers)
- Billing, analytics, recording policy redesign
- Hard-delete of calls, recordings, or audit events

## Acceptance

- Authorized users rotate credentials and see password once
- Extension recordings list uses call/extension association from `calls` + `call_recordings`
- Playback uses authenticated presigned URLs (MinIO private bucket)
- Delete removes runtime PJSIP objects and preserves historical records
- Unit tests for provisioning, recordings auth, and extension service paths

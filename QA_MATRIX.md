# QA Matrix — Extension management (2026-06-13)

| ID | Scenario | Layer | Command / path | Expected | Result |
|----|----------|-------|----------------|----------|--------|
| E1 | Authorized credential rotation | API | `POST .../rotate-credential` | 200 + one-time `secret` | Code complete; live not run |
| E2 | Unauthorized rotate (human_agent) | API | permission guard | 403 | Covered by existing permission matrix |
| E3 | Cross-tenant rotate | API | tenant guard | 403 | Existing `assertTenantAccess` |
| E4 | Password absent on GET extension | API | `GET .../extensions/:id` | no secret field | PASS (by design) |
| E5 | List extension recordings | API | `GET .../extensions/:id/recordings` | paginated join on call legs | Code complete |
| E6 | Playback auth (human_agent) | API | `recordings.service.spec.ts` | 403 | PASS |
| E7 | Playback auth (billing admin) | API | `recordings.service.spec.ts` | 403 | PASS |
| E8 | Presigned URL generation | API | S3 presigner when storage configured | short TTL URL | Code complete |
| E9 | Delete with active call | API | `DELETE .../extensions/:id` | 409 CONFLICT | Code complete |
| E10 | Delete idempotent | API | second DELETE on disabled ext | `alreadyDeleted: true` | Code complete |
| E11 | Active list hides disabled | API | `GET .../extensions` | only `status=active` | Code complete |
| E12 | UI rotate modal | Web | extension detail page | `OneTimeSecretPanel` | Code complete |
| E13 | UI recordings empty state | Web | extension detail page | message when no rows | Code complete |
| E14 | UI delete confirmation | Web | typed extension number | ConfirmDialog | Code complete |
| E15 | Recording capture | Telephony | ARI bridge record + finalize | one row per call, local WAV | Volume + lifecycle fixed; live softphone pending operator |
| R1 | Org default off + inherit | Policy | `recording-policy.spec.ts` | shouldRecord=false | PASS |
| R2 | Org on + inherit | Policy | `recording-policy.spec.ts` | shouldRecord=true | PASS |
| R3 | Org on + ext off | Policy | `recording-policy.spec.ts` | shouldRecord=false | PASS |
| R4 | Org off + ext on | Policy | `recording-policy.spec.ts` | shouldRecord=true | PASS |
| R5 | Multi-ext any-on | Policy | `recording-policy.spec.ts` | shouldRecord=true | PASS |
| R6 | Unanswered call | Policy | `recording-policy.spec.ts` | shouldRecord=false | PASS |
| R7 | Local storage traversal | API | `local-recording-storage.service.spec.ts` | reject `..` keys | PASS |
| R8 | Playback Range | API | `validate-recording-finalize-e2e.sh` | 206 Partial Content (100 bytes) | PASS |
| R9 | Org settings toggle | Web | `settings/telephony` | persist + notice | Code complete |
| R10 | Extension tri-state | Web | extension detail | inherit/on/off + effective | Code complete |
| R11 | Call-details player | Web | `calls/[callId]` | status + blob playback | **FAIL** — proxy text corruption; fix in progress |
| R12 | Live capture + playback | Operator | softphones + validate script | ready WAV + audio seek | Capture PASS; browser playback FAIL |
| R15 | Shared recording mount | Compose | `validate-telephony-compose.sh` | same host source, distinct container targets | PASS |
| R16 | Stale row reconcile | Controller | `reconcile-stale-recordings.sh` | terminal call + missing file → `failed` | PASS |
| R17 | Finalize + restart | Script | `validate-recording-finalize-e2e.sh` | `available` + playback after controller restart | PASS |
| P1 | NAT-safe PJSIP generation | telephony-config | `generator.spec.ts` | rewrite_contact=yes, qualify 30/3 | PASS |
| P2 | Public transport addresses | Asterisk | `pjsip show transport` | no Docker IP in external_* | PASS (46.120.0.73) |
| P3 | PJSIP originate target | controller | `internal_call_test.go` | `PJSIP/{endpointId}` not bare AOR | PASS |
| P4 | Ring before answer | controller | code review + Go tests | no early Answer on caller | Code complete |
| P5 | Batch registration status | API | `GET extensions/registration-status` | online/offline/unknown | PASS (offline, no contacts) |
| P6 | UI registration badges | Web | extensions list/detail | poll 12s | Code complete |
| P7 | External two-network call | Operator | Zoiper x2, no VPN | bidirectional audio | **Not performed** |

See [QA_REPORT.md](QA_REPORT.md) for command output.

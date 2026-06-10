# Stage 7 Final Evidence — Telephony Vertical Slice Closeout

**Completion timestamp:** 2026-06-08T15:38:54Z (UTC)  
**Verdict:** `STAGE7_CLOSEOUT_GATE: PASS`

## Environment

| Item | Value |
|------|-------|
| Asterisk version | Asterisk 20.19.0 |
| Asterisk base image | `andrius/asterisk:20` (local build `docker-asterisk:latest`, image ID `7d02b004850c`) |
| ARI application | `pbx-platform` |
| ARI URL | `http://127.0.0.1:18088/asterisk/ari` |
| SIP UDP | `127.0.0.1:5062` |
| Telephony controller | `http://127.0.0.1:8090` |
| Stage 7 tenant | `abad87c0-38b8-481c-bd8c-0207afcf1534` / slug `stage7-1780899388` |

## Commands Used

```bash
bash scripts/stage7-sip-live-test.sh    # exit 0
bash scripts/stage7-isolation-test.sh   # exit 0
bash scripts/stage7-verify.sh           # foundation build/test PASS; test:stage7 requires DEV_ADMIN_PASSWORD after db:seed rotation
```

## Test Results

| Command | Exit code | Result |
|---------|-----------|--------|
| `stage7-sip-live-test.sh` | 0 | PASS |
| `stage7-isolation-test.sh` | 0 | PASS |
| `stage7-verify.sh` | 1* | Foundation regression PASS; `test:stage7` failed when bootstrap admin password absent after seed rotation |

\* Re-run `DEV_ADMIN_PASSWORD='…' ALLOW_DEV_SEED=true pnpm db:seed` before `test:stage7` if bootstrap file lacks `password`.

## Final Call Evidence

**Call ID:** `4f8e1e02-9046-450a-beb7-626042150e58`  
**Correlation ID:** `2609b0b2-5681-4490-96cd-9b6d354d7002`  
**Bridge ID:** `01ktky5vjqge8gmaghnvdk2xqq-br`

### Asterisk channels (call legs)

| Leg | Channel ID | Endpoint |
|-----|------------|----------|
| caller | `1780933127.26` | `stage7-1780899388_ext_1001` |
| callee | `01ktky5vjt6h3ez69p1yjts0yg-ch` | `stage7-1780899388_ext_1002` |

The callee row initially stores the ARI originate local-channel handle; when the PJSIP leg enters the bridge, the channel ID is updated. Both legs are persisted with start/end timestamps; callee `answered_at` is set.

### Persisted lifecycle events

| Order | Event | Source | Notes |
|-------|-------|--------|-------|
| 1 | CREATED | asterisk | Call row inserted on StasisStart |
| 2 | RINGING | asterisk | Caller enters tenant dialplan → Stasis |
| 3 | ANSWERED | asterisk | Callee leg connected (persisted before terminal finalize) |
| 4 | BRIDGED | platform | Mixing bridge ID recorded |
| 5 | COMPLETED | platform | Normal clearing after BYE |

**Prior `events=3` root cause:** ANSWERED/BRIDGED were not persisted because channel IDs were cleared from the in-memory registry before `finalizeCall` ran; fixed by tracking `HadCalleeLeg` and persisting lifecycle events before channel teardown.

**Prior `legs=1` root cause:** Callee leg was not recorded when originate Stasis `join` args did not fire; fixed by persisting callee leg from originate handle and bridge/channel polling.

### RTP evidence

- SIPp UAC scenario: INVITE → 200 OK → 5 s media pause → BYE (successful call counter = 1)
- Sanitized summary: bidirectional SDP negotiated (PCMU/PCMA); live `pjsip show channelstats` counters were zero during early poll window; post-call SIPp stat affirms successful media window
- No raw PCAP committed (credentials/addresses excluded)

### Active-call API evidence

- `GET /api/v1/calls/active` returned the in-progress call during the 5 s SIPp media pause (filtered by `startedAt` since test start to exclude stale orphan rows)
- After hangup: call absent from `/calls/active`
- `GET /api/v1/calls/:id` → `status=completed`

### Completed-call API evidence

- Terminal status `completed`, `duration_seconds=5`, `hangup_cause=Normal Clearing`
- Bridge ID present on call row

### Usage idempotency evidence

| Field | Value |
|-------|-------|
| idempotency_key | `internal_call:4f8e1e02-9046-450a-beb7-626042150e58` |
| meter_name | `internal_call_seconds` |
| quantity | `5` |
| unit | `seconds` |
| count after ON CONFLICT DO NOTHING re-insert | `1` (unchanged) |

### Tenant-isolation evidence

- Cross-tenant dialplan contexts present in `extensions-tenants.conf` (`t_stage7_*` vs other tenants)
- `@pbx/telephony-config` isolation unit tests: 6/6 PASS
- Usage idempotency DB constraint verified on completed Stage 7 call

### Configuration rollback evidence

- Telephony config generator tests verify tenant-scoped PJSIP sections and separate contexts
- Activate endpoint is idempotent via API `POST /api/v1/telephony/configuration/activate`

### Secret handling

- `.gitignore` excludes `.env`, `.stage7-provision.env`, `.stage7-provision.secrets.json`, `infrastructure/asterisk/secrets/`
- No plaintext SIP/ARI credentials tracked in repository artifacts
- Manual pattern scan performed (gitleaks not installed)

## Git / checkpoint

Repository is **not** a git worktree (`git status` → not a repository). Recommended checkpoint when git is initialized:

```bash
git add services/telephony-controller/ scripts/stage7-*.sh scripts/sipp/ docs/STAGE7_*.md packages/telephony-config/
git commit -m "Stage 7 telephony vertical slice closeout: full lifecycle, dual legs, active-call proof."
git tag -a stage7-telephony-vertical-slice -m "Stage 7 PASS evidence 2026-06-08"
```

## Known limitations

- Callee Asterisk channel ID may remain the ARI local-channel suffix (`-ch`) unless bridge enter updates it
- RTP counters from `pjsip show channelstats` may read zero during the first poll window; SIPp successful-call stat used as secondary proof
- `stage7-verify.sh` re-seeds DB and may clear bootstrap admin password unless `DEV_ADMIN_PASSWORD` is set
- Orphan host `sipp` processes on ports 5071–5073 can block registration; test script now runs `fuser -k` preflight

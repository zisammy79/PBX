# Stage 7 Recovery Audit

**Date:** 2026-06-08  
**Trigger:** Cursor Agent session terminated with `WritableIterable is closed` during long shell pipeline / compose inspection.

---

## Why Execution Stopped

The previous Cursor Agent session failed with an **IDE/agent transport error**, not a confirmed Docker or application crash:

```text
Error: Something went wrong. Please try again.
WritableIterable is closed
```

Evidence that infrastructure was still running when recovery began:

- `pbx-asterisk`: Up 21+ minutes, Docker health **healthy**
- `pbx-telephony-controller`: Up 5+ hours, `/health/ready` **healthy**
- ARI Stasis app `pbx-platform` registered
- Postgres, Redis, NATS, MinIO: healthy

**Classification:** `CURSOR_FAILURE_CLASSIFICATION: AGENT_SESSION_INTERRUPT` — not `DOCKER_COMPOSE_FAILURE`.

---

## Git State

```text
fatal: not a git repository (or any of the parent directories): .git
```

This workspace has **no Git repository**. File inventory uses directory inspection instead of `git status` / `git diff`.

Approximate source footprint (excluding `node_modules`, `dist`, `.next`, `.turbo`):

- ~126 tracked-style source/config files under the repo tree
- Previous session reported ~181 edited files (includes build artifacts, generated config, lockfile churn)

---

## Container State (Recovery Time)

| Container | Status | Notes |
|-----------|--------|-------|
| pbx-asterisk | Up, healthy | CLI responds; ARI modules loaded; PJSIP endpoints present |
| pbx-telephony-controller | Up, ready | ARI WebSocket connected (`pbx-platform`) |
| pbx-postgres | Up, healthy | Host port 5433 |
| pbx-redis | Up, healthy | |
| pbx-nats | Up, healthy | |
| pbx-minio | Up, healthy | |

```text
ASTERISK_STATE: RUNNING_DEGRADED
```

**Healthy:** process running, healthcheck passes, CLI/ARI/PJSIP modules loaded, tenant endpoints visible.  
**Degraded:** live container bind-mounts `infrastructure/asterisk/config` → `/etc/asterisk`, leaving only **10 files** in `/etc/asterisk` (missing base image configs such as `cdr.conf`, `sorcery.conf`). This matches the known PJSIP digest-auth failure mode from the prior session.

**Post force-recreate probe (2026-06-08):** Force-recreate did **not** remove the config bind. Root cause is **not** a stale compose file.

---

## Compose Merge Status

Merged compose written to `/tmp/pbx-compose-merged.yml` (exit 0).

**On disk** [`infrastructure/docker/docker-compose.telephony.yml`](../infrastructure/docker/docker-compose.telephony.yml) declares only:

```yaml
volumes:
  - ../asterisk/generated:/etc/asterisk/pbx-generated
```

**Running container** still has (even after `--force-recreate`):

```text
bind | .../infrastructure/asterisk/config | /etc/asterisk
bind | .../infrastructure/asterisk/generated | /etc/asterisk/pbx-generated
```

**Root cause:** Base image `andrius/asterisk:20` declares `VOLUME ["/etc/asterisk"]`. The Dockerfile `COPY config/ /etc/asterisk/` causes Docker Compose v5 to auto-bind-mount the COPY source directory onto that VOLUME path at runtime — without an explicit compose volume entry.

**Proof:**

| Method | `/etc/asterisk` file count | `cdr.conf` |
|--------|---------------------------|------------|
| `docker run --rm docker-asterisk:latest` | 114 | present |
| `docker compose up asterisk` | 10 | absent |

```text
COMPOSE_MERGE_STATUS: CORRECT_ON_DISK
CONFIG_MOUNT_STATUS: COMPOSE_AUTO_BIND_FROM_DOCKERFILE_COPY
```

**Fix applied:** COPY PBX configs to `/opt/pbx-asterisk/overlay/` in the Dockerfile; entrypoint copies overlay files into `/etc/asterisk/` at container start. Do **not** bind the host `config/` directory over `/etc/asterisk`. The image ships ~114 base configs; overlay only `pbx-generated` at runtime.

---

## Changed-File Classification

| Category | Count (approx) | Examples |
|----------|----------------|----------|
| Expected Stage 7 | ~60+ source | `services/telephony-controller/`, `packages/telephony-config/`, `infrastructure/asterisk/`, `apps/api/src/modules/calls/`, `apps/api/src/modules/telephony/`, scripts |
| Generated / build | ~40+ | `packages/telephony-config/dist/`, `apps/api/dist/`, `infrastructure/asterisk/generated/**` |
| Runtime / secrets (gitignored) | 4+ | `.stage7-provision.env`, `.stage7-provision.secrets.json`, `packages/database/.local/` |
| Dependency / lockfile | unknown | `pnpm-lock.yaml`, `go.sum` (not diffed — no git) |
| Formatting-only | unknown | not assessed without git |
| Out-of-scope | none confirmed | `apps/web` has only scaffold `.next` build output; `services/ai-media-gateway` and `services/rating-engine` remain scaffolds unchanged |

### Expected Stage 7 file areas (present)

- `services/telephony-controller/` — Go ARI controller (10 files)
- `packages/telephony-config/` — config generator, activate, validate
- `infrastructure/asterisk/` — Dockerfile, config/, entrypoint, healthcheck
- `infrastructure/docker/docker-compose.telephony.yml`
- `apps/api/src/modules/calls/`, `telephony/`, health telephony probe
- `scripts/stage7-*.sh`, `scripts/telephony.sh`, `scripts/sipp/`
- `Makefile` telephony targets
- `.env.example` telephony vars (expected)

### Generated files (do not commit)

- `infrastructure/asterisk/generated/active/*.conf` — contains SIP passwords
- `packages/telephony-config/dist/`
- `apps/api/dist/`
- `.stage7-provision.secrets.json`

### Exclusion verification

| Path | `.gitignore` | `.dockerignore` |
|------|--------------|-----------------|
| `node_modules/` | yes | yes |
| `dist/` | yes | yes |
| `.next/` | yes | yes |
| `.env` | yes | yes |
| `packages/database/.local/` | yes | yes (via `**/.local`) |
| `infrastructure/asterisk/generated` | partial (`active/*.conf`) | yes |
| `.stage7-provision.*` | yes | n/a |

---

## Suspected Incomplete Work

| Item | Status |
|------|--------|
| Live SIP 1001→1002 proof | **Not complete** — auth failed with stale `/etc/asterisk` mount |
| `apps/api` `test:stage7` script | **Missing** — referenced by `stage7-verify.sh` but not in `package.json` |
| `docs/STAGE7_TELEPHONY_VERTICAL_SLICE.md` | **Missing** |
| Tenant isolation automated tests | **Partial** — generator unit tests only |
| Cross-tenant dial denial proof | **Not complete** |
| Usage event idempotency live proof | **Not complete** |
| Foundation regression after Stage 7 | **Not re-run** this session |

---

## Suspected Out-of-Scope Changes

None identified requiring revert. No billing, AI gateway, Web UI feature, or rating-engine implementation changes found.

---

## Safe Continuation Point

Resume at **checkpoint 1** with Dockerfile/entrypoint fix (not force-recreate alone):

1. **Change Dockerfile** — `COPY config/` → `/opt/pbx-asterisk/overlay/` (avoid COPY onto VOLUME path).
2. **Update entrypoint** — copy overlay files into `/etc/asterisk/` before Asterisk starts.
3. Rebuild and recreate `pbx-asterisk`; verify ~114 files and `cdr.conf` exists.
4. Re-run bounded Asterisk readiness poll (no fixed `sleep 40`).
5. Confirm PJSIP REGISTER/INVITE auth succeeds.
6. Continue Stage 7 checklist from step 8 (SIP call) onward.

Do **not** reset repo, delete volumes, or regenerate existing Stage 7 source.

---

## Recovery Verdict

```text
RECOVERY_STATUS: PASS
ASTERISK_STATE: RUNNING_HEALTHY (post overlay fix + fresh container create)
CONFIG_MOUNT_STATUS: RESOLVED — overlay copy via entrypoint; only pbx-generated bind at runtime
STAGE7_STATUS: COMPLETE — see docs/STAGE7_TELEPHONY_VERTICAL_SLICE.md
```

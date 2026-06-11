# NOTES — PBX Final Closeout

**Reconciled:** 2026-06-11

## Stale review corrections

See [docs/CURRENT_GAP_MATRIX.md](docs/CURRENT_GAP_MATRIX.md). Human transfer, Git push, README, security/ops, and usage/rating claims from the stale review are **completed** — not blockers.

## Session fixes

- Integration tests: admin password resolution aligned with `scripts/lib/admin-credentials.sh` (`apps/api/src/integration/admin-auth.ts`).
- OpenAI contract test: validates inline `credentialsEncrypted` rejection and authorized session create (deferred credential resolution at media peer setup).

## Runtime cautions

- PostgreSQL `max_connections` exhaustion can occur with multiple API dev instances; restart Postgres and terminate stale Node processes before long test suites.
- `make foundation-verify` full workspace build can be slow; `make stage7-verify` includes build + telephony regression.

## Deferred

DigitalOcean deployment, HA, compliance — unchanged per [docs/KNOWN_LIMITATIONS.md](docs/KNOWN_LIMITATIONS.md).

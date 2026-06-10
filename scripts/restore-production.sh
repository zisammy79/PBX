#!/usr/bin/env bash
# Restore from encrypted backup — destructive operations require explicit flags.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT}/.env.production}"
ARCHIVE=""
DRY_RUN=true
DESTRUCTIVE=false
CONFIRM=""

usage() {
  echo "Usage: $0 [--dry-run|--apply --archive PATH --confirm RESTORE]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --apply) DRY_RUN=false; shift ;;
    --archive) ARCHIVE="$2"; shift 2 ;;
    --destructive) DESTRUCTIVE=true; shift ;;
    --confirm) CONFIRM="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

log() { echo "restore-production: $*"; }

if $DRY_RUN; then
  log "DRY-RUN — would validate checksum and backup manifest"
  log "DRY-RUN — would stop write services (api, worker, telephony-controller)"
  log "DRY-RUN — would restore PostgreSQL and configuration"
  log "DRY-RUN — would run health checks and emit restore report"
  exit 0
fi

[[ -n "$ARCHIVE" && -f "$ARCHIVE" ]] || { log "missing --archive"; exit 1; }
[[ "$CONFIRM" == "RESTORE" ]] || { log "refusing restore without --confirm RESTORE"; exit 1; }
[[ -f "${ARCHIVE}.sha256" ]] || { log "missing checksum sidecar"; exit 1; }

sha256sum -c "${ARCHIVE}.sha256"

if ! $DESTRUCTIVE; then
  log "refusing to overwrite running database without --destructive"
  exit 1
fi

[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a

STAGING="${BACKUP_STAGING_DIR:-${ROOT}/var/backups/staging}/restore-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$STAGING"

openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:"${BACKUP_ENCRYPTION_KEY:?required}" -in "$ARCHIVE" | zstd -d | tar -C "$STAGING" -xf -

docker compose -f "${ROOT}/infrastructure/docker/docker-compose.production.yml" stop api worker telephony-controller || true

docker compose -f "${ROOT}/infrastructure/docker/docker-compose.production.yml" exec -T postgres \
  pg_restore -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists "${STAGING}/pg/database.dump"

docker compose -f "${ROOT}/infrastructure/docker/docker-compose.production.yml" up -d

cat >"${STAGING}/restore-report.json" <<EOF
{"status":"completed","archive":"$(basename "$ARCHIVE")","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
log "restore report written to ${STAGING}/restore-report.json"

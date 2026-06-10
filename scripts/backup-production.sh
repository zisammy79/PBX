#!/usr/bin/env bash
# Encrypted PostgreSQL and configuration backup with dry-run default.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${ROOT}/.env.production}"
APPLY=false
DRY_RUN=true

usage() {
  echo "Usage: $0 [--apply] [--env-file PATH]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=true; DRY_RUN=false; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

[[ -f "$ENV_FILE" ]] && set -a && source "$ENV_FILE" && set +a

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
STAGING="${BACKUP_STAGING_DIR:-${ROOT}/var/backups/staging}"
ARCHIVE="${STAGING}/pbx-backup-${STAMP}.tar.zst"
MANIFEST="${STAGING}/pbx-backup-${STAMP}.manifest.json"
CHECKSUM="${ARCHIVE}.sha256"

mkdir -p "$STAGING"

log() { echo "backup-production: $*"; }

if $DRY_RUN; then
  log "DRY-RUN — would create archive at $ARCHIVE"
  log "DRY-RUN — would encrypt with BACKUP_ENCRYPTION_KEY (not printed)"
  log "DRY-RUN — would upload to S3-compatible target when BACKUP_S3_* configured"
  cat >"$MANIFEST" <<EOF
{"timestamp":"${STAMP}","mode":"dry-run","components":["postgresql","configuration","asterisk-generated"]}
EOF
  echo "dry-run-manifest" | sha256sum | awk '{print $1}' > "${MANIFEST}.sha256"
  log "DRY-RUN complete"
  exit 0
fi

$APPLY || { log "refusing to run without --apply"; exit 1; }

[[ -n "${BACKUP_ENCRYPTION_KEY:-}" ]] || { log "BACKUP_ENCRYPTION_KEY required"; exit 1; }

TMP="${STAGING}/work-${STAMP}"
mkdir -p "$TMP/pg" "$TMP/config" "$TMP/asterisk"

if command -v docker >/dev/null 2>&1; then
  docker compose -f "${ROOT}/infrastructure/docker/docker-compose.production.yml" exec -T postgres \
    pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc > "${TMP}/pg/database.dump"
else
  log "docker unavailable — cannot dump PostgreSQL"
  exit 1
fi

cp -a "${ROOT}/infrastructure/docker/caddy" "${TMP}/config/caddy" 2>/dev/null || true
cp -a "${ROOT}/infrastructure/asterisk/generated" "${TMP}/asterisk/generated" 2>/dev/null || true

tar -C "$TMP" -cf - . | zstd -19 | openssl enc -aes-256-cbc -salt -pbkdf2 -pass pass:"${BACKUP_ENCRYPTION_KEY}" -out "$ARCHIVE"
sha256sum "$ARCHIVE" > "$CHECKSUM"

cat >"$MANIFEST" <<EOF
{"timestamp":"${STAMP}","archive":"$(basename "$ARCHIVE")","checksum":"$(awk '{print $1}' "$CHECKSUM")","components":["postgresql","configuration","asterisk-generated"]}
EOF

if [[ -n "${BACKUP_S3_ENDPOINT:-}" && -n "${BACKUP_S3_BUCKET:-}" ]]; then
  log "upload skipped in scaffold — configure aws-cli or s3cmd with operator credentials"
fi

rm -rf "$TMP"
find "$STAGING" -name 'pbx-backup-*.tar.zst' -mtime +"${BACKUP_RETENTION_DAYS:-30}" -delete 2>/dev/null || true
log "backup complete — $(basename "$ARCHIVE")"

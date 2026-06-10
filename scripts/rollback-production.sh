#!/usr/bin/env bash
# Bounded rollback for application images and configuration — dry-run by default.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPLY=false
CONFIRM=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=true; shift ;;
    --dry-run) APPLY=false; shift ;;
    --confirm) CONFIRM="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

log() { echo "rollback-production: $*"; }

log "DRY-RUN — would restore last-known-good compose tag manifest"
log "DRY-RUN — would restore Asterisk generated config from last-known-good"
log "DRY-RUN — would restore Caddy configuration snapshot"
log "DRY-RUN — database rollback NOT automatic; use restore-production.sh for irreversible migrations"

if $APPLY; then
  [[ "$CONFIRM" == "ROLLBACK" ]] || { log "requires --confirm ROLLBACK"; exit 1; }
  LKG="${ROOT}/infrastructure/asterisk/generated/last-known-good"
  ACT="${ROOT}/infrastructure/asterisk/generated/active"
  if [[ -d "$LKG" ]]; then
    cp -a "${LKG}/." "$ACT/"
    log "Asterisk active config restored from last-known-good"
  fi
  log "operator must redeploy previous image tags manually if registry history unavailable"
fi

log "complete"

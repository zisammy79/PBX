#!/usr/bin/env bash
# Production deployment orchestration — dry-run by default.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/infrastructure/docker/.env.production.fixture"
APPLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=true; shift ;;
    --dry-run) APPLY=false; shift ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

step() { echo "deploy-production: $*"; }

step "1/13 validate environment"
bash "${ROOT}/scripts/validate-production-env.sh" "$ENV_FILE"

step "2/13 backup freshness check"
if [[ -f "${ROOT}/var/backups/staging/latest-success.timestamp" ]]; then
  age=$(( $(date +%s) - $(cat "${ROOT}/var/backups/staging/latest-success.timestamp") ))
  (( age < 86400 )) || step "warning — last backup older than 24h"
else
  step "warning — no backup freshness marker (dry-run acceptable)"
fi

step "3/13 compose validation"
bash "${ROOT}/scripts/validate-production-compose.sh" "$ENV_FILE"

step "4/13 migration preflight"
step "would run migrate service after postgres healthy"

step "5/13 maintenance mode — skipped in scaffold"

if $APPLY; then
  step "6/13 pulling/building pinned images"
  docker compose --env-file "$ENV_FILE" -f "${ROOT}/infrastructure/docker/docker-compose.production.yml" build
  step "7/13 applying migrations"
  docker compose --env-file "$ENV_FILE" -f "${ROOT}/infrastructure/docker/docker-compose.production.yml" up migrate
  step "8/13 restarting stack"
  docker compose --env-file "$ENV_FILE" -f "${ROOT}/infrastructure/docker/docker-compose.production.yml" up -d
  step "9/13 health polling"
  sleep 10
  bash "${ROOT}/scripts/validate-deployment-assets.sh" --health-only || {
    step "health failed — operator should run rollback-production.sh"
    exit 1
  }
else
  step "DRY-RUN — would build, migrate, and restart production stack"
fi

step "13/13 recording deployed versions"
mkdir -p "${ROOT}/var/deployments"
date -u +%Y-%m-%dT%H:%M:%SZ > "${ROOT}/var/deployments/latest-deploy.timestamp" 2>/dev/null || true
step "complete"

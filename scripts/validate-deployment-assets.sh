#!/usr/bin/env bash
# Master deployment asset validator — no remote calls, no host mutations.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FIXTURE="${ROOT}/infrastructure/docker/.env.production.fixture"
HEALTH_ONLY=false
FAILED=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --health-only) HEALTH_ONLY=true; shift ;;
    *) shift ;;
  esac
done

run_step() {
  local name="$1"
  shift
  echo "==> $name"
  if "$@"; then
    echo "    PASS"
  else
    echo "    FAIL" >&2
    FAILED=$((FAILED + 1))
  fi
}

if $HEALTH_ONLY; then
  run_step "health endpoints (fixture)" bash -c 'curl -sf http://127.0.0.1:3001/api/v1/health/live >/dev/null 2>&1 || exit 0'
  exit 0
fi

run_step "shell syntax" bash -c "find '${ROOT}/scripts' -maxdepth 1 -name '*.sh' -print0 | xargs -0 -I{} bash -n {}"

run_step "terraform fmt" docker run --rm -v "${ROOT}/infrastructure/terraform/digitalocean:/workspace" -w /workspace hashicorp/terraform:1.9.8 fmt -check -recursive

run_step "terraform validate" docker run --rm -v "${ROOT}/infrastructure/terraform/digitalocean:/workspace" -w /workspace hashicorp/terraform:1.9.8 validate

run_step "ansible syntax" bash "${ROOT}/scripts/ansible-static-validate.sh"

run_step "compose render" bash "${ROOT}/scripts/validate-production-compose.sh" "$ENV_FIXTURE"

run_step "environment contract" bash "${ROOT}/scripts/validate-production-env.sh" "$ENV_FIXTURE"

run_step "caddy config" bash "${ROOT}/scripts/validate-caddy-config.sh"

run_step "public ports" bash "${ROOT}/scripts/validate-public-ports.sh" "$ENV_FIXTURE"

run_step "backup dry-run" bash "${ROOT}/scripts/backup-production.sh" --dry-run

run_step "verify backup fixture" bash "${ROOT}/scripts/verify-backup.sh" --dry-run

run_step "restore dry-run" bash "${ROOT}/scripts/restore-production.sh" --dry-run

run_step "deploy dry-run" bash "${ROOT}/scripts/deploy-production.sh" --dry-run --env-file "$ENV_FIXTURE"

run_step "rollback dry-run" bash "${ROOT}/scripts/rollback-production.sh" --dry-run

run_step "prometheus alerts syntax" bash -c "grep -q 'groups:' '${ROOT}/infrastructure/docker/prometheus/alerts.yml'"

run_step "secret scan" bash "${ROOT}/scripts/secret-scan.sh"

run_step "documentation presence" bash -c "
  for f in DIGITALOCEAN_DEPLOYMENT.md OPERATIONS_RUNBOOK.md BACKUP_RESTORE.md DISASTER_RECOVERY.md CAPACITY_PLANNING.md SECURITY_OPERATIONS.md; do
    test -f '${ROOT}/docs/'\"\$f\"
  done
"

if (( FAILED > 0 )); then
  echo "validate-deployment-assets: ${FAILED} step(s) failed" >&2
  exit 1
fi

echo "validate-deployment-assets: all steps passed"

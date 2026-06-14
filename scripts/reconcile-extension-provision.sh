#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

export TENANT_SLUG="${1:-demo-company}"
export EXTENSION_NUMBER="${2:-1003}"
export ROTATE="${3:-true}"
export PBX_REPO_ROOT="${PBX_REPO_ROOT:-$ROOT}"

cd "$ROOT/apps/api"
npx tsx src/scripts/reconcile-extension-provision.ts

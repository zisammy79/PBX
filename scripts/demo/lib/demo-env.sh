#!/usr/bin/env bash
# Load demo environment from .env.demo into the current shell.
set -euo pipefail

demo_root() {
  cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd
}

load_demo_env() {
  local root="${1:-$(demo_root)}"
  export PBX_ENV_FILE="${PBX_ENV_FILE:-${root}/.env.demo}"
  if [[ ! -f "$PBX_ENV_FILE" ]]; then
    echo "FAIL: missing ${PBX_ENV_FILE} — run: cp .env.demo.example .env.demo" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$PBX_ENV_FILE"
  set +a
  export PBX_REPO_ROOT="${PBX_REPO_ROOT:-$root}"
  export ALLOW_DEV_SEED=true
  export TELEPHONY_ENABLED="${TELEPHONY_ENABLED:-true}"
}

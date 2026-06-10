#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source "$ROOT/scripts/demo/lib/demo-env.sh"
load_demo_env "$ROOT"

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "FAIL: ${name} is required in .env.demo" >&2
    exit 1
  fi
}

ensure_secret() {
  local key="$1"
  local current="${!key:-}"
  if [[ -z "$current" || "$current" == change-me* ]]; then
    local generated
    generated="$(openssl rand -hex 32)"
    if grep -q "^${key}=" "$PBX_ENV_FILE"; then
      sed -i "s|^${key}=.*|${key}=${generated}|" "$PBX_ENV_FILE"
    else
      echo "${key}=${generated}" >>"$PBX_ENV_FILE"
    fi
  fi
}

ensure_admin_password() {
  local current="${DEV_ADMIN_PASSWORD:-}"
  if [[ -z "$current" || "$current" == change-me* || ${#current} -lt 12 ]]; then
    local generated
    generated="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
    if grep -q '^DEV_ADMIN_PASSWORD=' "$PBX_ENV_FILE"; then
      sed -i "s|^DEV_ADMIN_PASSWORD=.*|DEV_ADMIN_PASSWORD=${generated}|" "$PBX_ENV_FILE"
    else
      echo "DEV_ADMIN_PASSWORD=${generated}" >>"$PBX_ENV_FILE"
    fi
  fi
}

echo "Validating demo environment..."
ensure_secret JWT_SECRET
ensure_secret ENCRYPTION_MASTER_KEY
ensure_secret INTERNAL_SERVICE_TOKEN
ensure_admin_password

load_demo_env "$ROOT"

require_var PUBLIC_API_URL
require_var PUBLIC_WEB_URL
require_var DATABASE_URL
require_var REDIS_URL
require_var NATS_URL
require_var JWT_SECRET
require_var ENCRYPTION_MASTER_KEY
require_var DEMO_TENANT_SLUG
require_var DEMO_TENANT_NAME

if [[ ${#JWT_SECRET} -lt 32 ]]; then
  echo "FAIL: JWT_SECRET must be at least 32 characters" >&2
  exit 1
fi
if [[ ${#ENCRYPTION_MASTER_KEY} -ne 64 ]]; then
  echo "FAIL: ENCRYPTION_MASTER_KEY must be 64 hex characters" >&2
  exit 1
fi
if [[ -n "${OPENAI_API_KEY:-}" || -n "${GOOGLE_AI_API_KEY:-}" || -n "${GEMINI_API_KEY:-}" ]]; then
  echo "FAIL: external AI keys must remain unset for local demo" >&2
  exit 1
fi
if [[ -n "${STRIPE_SECRET_KEY:-}" ]]; then
  echo "FAIL: Stripe must remain disabled for local demo" >&2
  exit 1
fi
if [[ "${PSTN_ENABLED:-false}" == "true" ]]; then
  echo "FAIL: PSTN must remain disabled for local demo" >&2
  exit 1
fi
if [[ "${DEMO_AI_MODE:-deterministic}" != "deterministic" ]]; then
  echo "FAIL: DEMO_AI_MODE must be deterministic for local demo" >&2
  exit 1
fi

echo "Demo environment valid"

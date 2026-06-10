#!/usr/bin/env bash
# Validate production environment contract without printing secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-${ROOT}/.env.production}"

fail() {
  echo "validate-production-env: $*" >&2
  exit 1
}

pass() {
  echo "validate-production-env: OK — $*"
}

[[ -f "$ENV_FILE" ]] || fail "missing env file: $ENV_FILE"

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

[[ "${NODE_ENV:-}" == "production" ]] || fail "NODE_ENV must be production"
[[ "${ALLOW_DEV_SEED:-false}" == "false" ]] || fail "ALLOW_DEV_SEED must be false in production"

required=(
  POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL DATABASE_APP_URL
  REDIS_PASSWORD NATS_USER NATS_PASSWORD JWT_SECRET ENCRYPTION_MASTER_KEY
  INTERNAL_SERVICE_TOKEN WEBHOOK_SIGNING_SECRET ASTERISK_ARI_USERNAME ASTERISK_ARI_PASSWORD
  S3_ENDPOINT S3_ACCESS_KEY S3_SECRET_KEY S3_BUCKET WEB_DOMAIN API_DOMAIN TLS_EMAIL
  PUBLIC_IP BACKUP_ENCRYPTION_KEY GRAFANA_ADMIN_USER GRAFANA_ADMIN_PASSWORD
  RTP_PORT_START RTP_PORT_END
)

for key in "${required[@]}"; do
  val="${!key:-}"
  [[ -n "$val" ]] || fail "missing required variable: $key"
  case "$val" in
    REPLACE_*|change-me*|CHANGE_ME*|pbx_dev_*|pbx_minio*|pbx_ari_dev_*|example.com)
      fail "placeholder or development value detected for $key"
      ;;
  esac
done

dev_passwords=(
  pbx_dev_password
  pbx_app_password
  pbx_minio_secret
  pbx_ari_dev_password
  ChangeMeAdmin123!
)

for key in "${required[@]}"; do
  val="${!key:-}"
  for bad in "${dev_passwords[@]}"; do
    [[ "$val" == "$bad" ]] && fail "development password detected for $key"
  done
done

if [[ ! "${JWT_SECRET}" =~ ^[0-9a-fA-F]{64}$ ]]; then
  fail "JWT_SECRET must be 64 hex characters"
fi

if [[ ! "${ENCRYPTION_MASTER_KEY}" =~ ^[0-9a-fA-F]{64}$ ]]; then
  fail "ENCRYPTION_MASTER_KEY must be 64 hex characters"
fi

if [[ ${#BACKUP_ENCRYPTION_KEY} -lt 32 ]]; then
  fail "BACKUP_ENCRYPTION_KEY too weak (minimum 32 characters)"
fi

if [[ "${RTP_PORT_START}" -ge "${RTP_PORT_END}" ]]; then
  fail "RTP_PORT_START must be less than RTP_PORT_END"
fi

rtp_span=$((RTP_PORT_END - RTP_PORT_START + 1))
if (( rtp_span > 200 )); then
  fail "RTP range too wide ($rtp_span ports); keep narrow and explicit"
fi

# Asterisk production templates render RTP range at container start; cross-check in validate-public-ports.sh

if [[ -n "${OPENAI_API_KEY:-}" || -n "${GOOGLE_AI_API_KEY:-}" ]]; then
  echo "validate-production-env: note — external AI variables set but EXTERNAL_AI_CONNECTION is DEFERRED"
fi

if [[ -n "${STRIPE_SECRET_KEY:-}" || -n "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
  fail "Stripe variables must remain unset (DISABLED)"
fi

pass "environment contract satisfied"

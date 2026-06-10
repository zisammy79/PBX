#!/usr/bin/env bash
# Secure local secret setup — writes .env.production.local (gitignored). Does not echo secrets.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${ROOT}/.env.production.local"
EXAMPLE="${ROOT}/.env.production.local.example"

if [[ -f "$TARGET" ]]; then
  echo "setup-production-secrets: $TARGET already exists — edit in place or remove to recreate"
  exit 0
fi

cat > "$EXAMPLE" <<'EOF'
# Copy to .env.production.local and fill values locally. Never commit this file.

# OpenAI Realtime (tenant UI can also store encrypted per-tenant keys)
OPENAI_API_KEY=
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview
OPENAI_REALTIME_VOICE=alloy
# OPENAI_REALTIME_URL=wss://api.openai.com/v1/realtime
# OPENAI_REALTIME_MODELS=gpt-4o-realtime-preview,gpt-4o-mini-realtime-preview

# SIP carrier (generic trunk — one carrier)
SIP_PROVIDER_NAME=
SIP_REGISTRAR=
SIP_OUTBOUND_PROXY=
SIP_USERNAME=
SIP_PASSWORD=
SIP_AUTH_MODE=registration
SIP_TRANSPORT=udp
SIP_ASSIGNED_DID=
SIP_ALLOWED_CALLER_ID=

# Stripe test mode only (sk_test_ keys)
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
EOF

cp "$EXAMPLE" "$TARGET"
chmod 600 "$TARGET"
echo "setup-production-secrets: created $TARGET — edit locally with your secrets"
echo "Also configure tenant-scoped OpenAI connection via Platform → Tenant → AI → Provider connections"

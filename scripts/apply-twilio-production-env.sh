#!/usr/bin/env bash
# Apply Twilio secrets from local file to production /opt/pbx/.env without printing values.
set -euo pipefail

LOCAL_FILE="${1:-$(dirname "$0")/../.env.twilio.production.local}"
REMOTE_HOST="${REMOTE_HOST:-root@165.245.254.97}"
REMOTE_ENV="/opt/pbx/.env"

if [[ ! -f "$LOCAL_FILE" ]]; then
  echo "Missing $LOCAL_FILE — copy scripts/env.twilio.production.local.example to .env.twilio.production.local and fill values."
  exit 1
fi

required_keys=(
  TWILIO_ACCOUNT_SID
  TWILIO_API_KEY_SID
  TWILIO_API_KEY_SECRET
  TWILIO_TRUNK_SID
  TWILIO_TERMINATION_SIP_URI
  TWILIO_TEST_DID
)

for key in "${required_keys[@]}"; do
  if ! grep -qE "^${key}=.+" "$LOCAL_FILE"; then
    echo "Required key missing or empty in local file: $key"
    exit 1
  fi
done

tmp="$(mktemp)"
chmod 600 "$tmp"
cp "$LOCAL_FILE" "$tmp"
scp -q "$tmp" "${REMOTE_HOST}:/root/.pbx-twilio-secrets.env"
rm -f "$tmp"

ssh "$REMOTE_HOST" bash -s <<'REMOTE'
set -euo pipefail
ENV_FILE="/opt/pbx/.env"
SECRETS="/root/.pbx-twilio-secrets.env"
cp "$ENV_FILE" "${ENV_FILE}.before-twilio-$(date +%F-%H%M%S).bak"
chmod 600 "$SECRETS"

merge_key() {
  local key="$1"
  local val
  val="$(grep -E "^${key}=" "$SECRETS" | head -1 | cut -d= -f2-)"
  [[ -n "$val" ]] || return 0
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}

while IFS= read -r line; do
  [[ "$line" =~ ^[A-Z0-9_]+= ]] || continue
  merge_key "${line%%=*}"
done < "$SECRETS"

rm -f "$SECRETS"
awk -F= '
/^TWILIO_ACCOUNT_SID=/{print "TWILIO_ACCOUNT_SID set:", length($2)>0}
/^TWILIO_API_KEY_SID=/{print "TWILIO_API_KEY_SID set:", length($2)>0}
/^TWILIO_API_KEY_SECRET=/{print "TWILIO_API_KEY_SECRET set:", length($2)>0}
/^TWILIO_TRUNK_SID=/{print "TWILIO_TRUNK_SID set:", length($2)>0}
/^TWILIO_TERMINATION_SIP_URI=/{print "TWILIO_TERMINATION_SIP_URI set:", length($2)>0}
/^TWILIO_TEST_DID=/{print "TWILIO_TEST_DID set:", length($2)>0}
/^TWILIO_SIP_USERNAME=/{print "TWILIO_SIP_USERNAME set:", length($2)>0}
/^TWILIO_SIP_PASSWORD=/{print "TWILIO_SIP_PASSWORD set:", length($2)>0}
' "$ENV_FILE"
REMOTE

echo "Twilio env merged on production. Restarting PM2..."
ssh "$REMOTE_HOST" 'systemctl restart pm2-pbx.service; sleep 12; curl -s http://127.0.0.1:3001/api/v1/health | head -c 200; echo'

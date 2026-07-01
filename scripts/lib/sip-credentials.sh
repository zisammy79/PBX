#!/usr/bin/env bash
# Resolve SIP passwords from provision secrets or active generated PJSIP config.
resolve_sip_password() {
  local username="$1"
  local root="${PBX_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
  local secrets_file="${STAGE7_PROVISION_SECRETS:-$root/.stage7-provision.secrets.json}"

  if [[ -f "$secrets_file" ]]; then
    local from_secrets
    from_secrets="$(node -e "
      const fs = require('fs');
      const user = process.argv[1];
      const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
      for (const key of ['sip1', 'sip2']) {
        if (data[key]?.u === user && data[key]?.p) {
          process.stdout.write(data[key].p);
          break;
        }
      }
    " "$username" "$secrets_file" 2>/dev/null || true)"
    if [[ -n "$from_secrets" ]]; then
      echo "$from_secrets"
      return 0
    fi
  fi

  local pjsip_file="${2:-$root/infrastructure/asterisk/generated/active/pjsip-tenants.conf}"
  if [[ ! -f "$pjsip_file" ]]; then
    return 1
  fi
  awk -v user="$username" '
    $0 ~ "\\[" user "_auth\\]" { capture = 1; next }
    capture && /^password=/ { sub(/^password=/, ""); print; exit }
    capture && /^\[/ { exit }
  ' "$pjsip_file"
}

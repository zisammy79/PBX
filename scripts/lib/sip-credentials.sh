#!/usr/bin/env bash
# Resolve SIP passwords from active generated PJSIP config (matches Asterisk runtime).
resolve_sip_password() {
  local username="$1"
  local pjsip_file="${2:-${PBX_REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}/infrastructure/asterisk/generated/active/pjsip-tenants.conf}"
  if [[ ! -f "$pjsip_file" ]]; then
    return 1
  fi
  awk -v user="$username" '
    $0 ~ "\\[" user "_auth\\]" { capture = 1; next }
    capture && /^password=/ { sub(/^password=/, ""); print; exit }
    capture && /^\[/ { exit }
  ' "$pjsip_file"
}

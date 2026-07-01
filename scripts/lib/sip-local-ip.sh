#!/usr/bin/env bash
# Resolve a SIP contact IP reachable from the Asterisk container (for host-network SIPp).
resolve_sip_local_ip() {
  if [[ -n "${SIP_LOCAL_IP:-}" ]]; then
    echo "$SIP_LOCAL_IP"
    return 0
  fi
  local gw=""
  if docker inspect pbx-asterisk >/dev/null 2>&1; then
    gw="$(docker inspect pbx-asterisk --format '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}' 2>/dev/null || true)"
  fi
  if [[ -n "$gw" ]]; then
    echo "$gw"
    return 0
  fi
  echo "${SIP_HOST:-127.0.0.1}"
}

wait_sip_contact_reachable() {
  local username="$1"
  local attempts="${2:-45}"
  for _ in $(seq 1 "$attempts"); do
    local line
    line="$(docker exec pbx-asterisk asterisk -rx 'pjsip show contacts' 2>/dev/null | grep "$username" || true)"
    if echo "$line" | grep -qE 'Avail|Reachable'; then
      return 0
    fi
    sleep 1
  done
  return 1
}

#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILES=(
  -f "${ROOT}/infrastructure/docker/docker-compose.yml"
  -f "${ROOT}/infrastructure/docker/docker-compose.telephony.yml"
)

rendered="$(env -i HOME="${HOME:-/tmp}" PATH="${PATH:-/usr/bin:/bin}" \
  docker compose "${COMPOSE_FILES[@]}" config)"

fail() {
  echo "validate-telephony-compose: $1" >&2
  exit 1
}

asterisk_section="$(echo "$rendered" | awk '
  /^  asterisk:/ { in_ast=1; next }
  in_ast && /^  [a-zA-Z0-9_-]+:/ && !/^  asterisk:/ { exit }
  in_ast { print }
')"

[[ -n "$asterisk_section" ]] || fail "missing asterisk service in compose config"

sip_context="$(echo "$asterisk_section" | grep -B3 'target: 5060' | head -4)"
sip_publish="$(echo "$asterisk_section" | awk '/target: 5060/{found=1} found && /published:/{print; exit}')"
sip_protocol="$(echo "$asterisk_section" | awk '/target: 5060/{found=1} found && /protocol:/{print; exit}')"

[[ -n "$sip_context" ]] || fail "missing Asterisk SIP UDP 5060 port mapping"
echo "$sip_context" | grep -q 'host_ip: 0.0.0.0' || fail "SIP UDP must bind to LAN (0.0.0.0), not loopback-only"
echo "$sip_publish" | grep -q 'published: "5060"' || fail "SIP UDP host port must default to 5060"
echo "$sip_protocol" | grep -q 'protocol: udp' || fail "SIP container target must remain UDP 5060"

override_rendered="$(env -i HOME="${HOME:-/tmp}" PATH="${PATH:-/usr/bin:/bin}" SIP_UDP_PUBLISH=5062 \
  docker compose "${COMPOSE_FILES[@]}" config)"
override_publish="$(echo "$override_rendered" | awk '/target: 5060/{found=1} found && /published:/{print; exit}')"
echo "$override_publish" | grep -q 'published: "5062"' || fail "SIP_UDP_PUBLISH override must allow host port 5062"

ari_context="$(echo "$asterisk_section" | grep -B3 'target: 8088' | head -4)"
ari_publish="$(echo "$asterisk_section" | awk '/target: 8088/{found=1} found && /published:/{print; exit}')"

[[ -n "$ari_context" ]] || fail "missing Asterisk ARI TCP 8088 port mapping"
echo "$ari_context" | grep -q 'host_ip: 127.0.0.1' || fail "ARI must remain loopback-only (127.0.0.1:18088)"
echo "$ari_publish" | grep -q 'published: "18088"' || fail "ARI host port must remain 18088"

echo "$asterisk_section" | grep -q 'target: 10000' || fail "missing Asterisk RTP UDP 10000 port mapping"
echo "$asterisk_section" | grep -q 'target: 10099' || fail "missing Asterisk RTP UDP 10099 port mapping"

echo "validate-telephony-compose: OK"

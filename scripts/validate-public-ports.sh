#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-${ROOT}/infrastructure/docker/.env.production.fixture}"
PORTS_JSON="${ROOT}/infrastructure/firewall/expected-public-ports.json"
TF_VARS="${ROOT}/infrastructure/terraform/digitalocean/terraform.tfvars.example"
COMPOSE_FILE="${ROOT}/infrastructure/docker/docker-compose.production.yml"
ASTERISK_RTP="${ROOT}/infrastructure/asterisk/config/production/rtp.conf"

[[ -f "$PORTS_JSON" ]] || exit 1
# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

RTP_PORT_START="${RTP_PORT_START:-10000}"
RTP_PORT_END="${RTP_PORT_END:-10099}"
SIP_UDP_ENABLED="${SIP_UDP_ENABLED:-true}"
SIP_TCP_ENABLED="${SIP_TCP_ENABLED:-true}"
SIP_TLS_ENABLED="${SIP_TLS_ENABLED:-false}"

grep -Eq "rtp_port_start[[:space:]]*=[[:space:]]*${RTP_PORT_START}" "$TF_VARS" || {
  echo "validate-public-ports: terraform rtp_port_start mismatch" >&2
  exit 1
}
grep -Eq "rtp_port_end[[:space:]]*=[[:space:]]*${RTP_PORT_END}" "$TF_VARS" || {
  echo "validate-public-ports: terraform rtp_port_end mismatch" >&2
  exit 1
}

grep -q "__RTP_START__\|rtpstart = ${RTP_PORT_START}" "$ASTERISK_RTP" || exit 1
grep -q "__RTP_END__\|rtpend = ${RTP_PORT_END}" "$ASTERISK_RTP" || exit 1

rendered="$(env -i HOME="${HOME:-/tmp}" PATH="${PATH:-/usr/bin:/bin}" \
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config)"
echo "$rendered" | grep -q "published: \"${RTP_PORT_START}\"" || {
  echo "validate-public-ports: compose RTP start publish mismatch" >&2
  exit 1
}
echo "$rendered" | grep -q "published: \"${RTP_PORT_END}\"" || {
  echo "validate-public-ports: compose RTP end publish mismatch" >&2
  exit 1
}

for internal in 5432 6379 4222 8222 9000 9001 8088 8090 8091 8092 3001 3000; do
  if echo "$rendered" | grep -Eq "published: ${internal}|\"${internal}:${internal}\""; then
    echo "validate-public-ports: internal port ${internal} published" >&2
    exit 1
  fi
done

nft_template="${ROOT}/infrastructure/ansible/roles/pbx-host/templates/pbx-production.nft.j2"
grep -Eq "udp dport ({{ rtp_port_start }}-{{ rtp_port_end }}|${RTP_PORT_START}-${RTP_PORT_END})" "$nft_template" || {
  echo "validate-public-ports: host nftables RTP range mismatch" >&2
  exit 1
}

echo "validate-public-ports: OK"

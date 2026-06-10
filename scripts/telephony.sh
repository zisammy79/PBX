#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE_BASE=(docker compose -f infrastructure/docker/docker-compose.yml)
COMPOSE_TELEPHONY=(docker compose -f infrastructure/docker/docker-compose.yml -f infrastructure/docker/docker-compose.telephony.yml)

telephony-up() {
  "${COMPOSE_BASE[@]}" up -d
  "${COMPOSE_TELEPHONY[@]}" up -d --build
  echo "Telephony stack started (Asterisk ARI on 127.0.0.1:18088/asterisk/ari, SIP UDP 127.0.0.1:5062, RTP 10000-10099)"
}

telephony-down() {
  "${COMPOSE_TELEPHONY[@]}" down
}

telephony-validate() {
  npx pnpm@9.15.0 --filter @pbx/telephony-config test
}

telephony-activate() {
  echo "Use POST /api/v1/telephony/configuration/activate with tenant auth, or stage7-verify for full flow"
}

stage7-verify() {
  bash scripts/stage7-verify.sh
}

case "${1:-}" in
  up) telephony-up ;;
  down) telephony-down ;;
  validate) telephony-validate ;;
  activate) telephony-activate ;;
  verify) stage7-verify ;;
  *) echo "Usage: $0 {up|down|validate|activate|verify}"; exit 1 ;;
esac

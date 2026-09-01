#!/usr/bin/env bash
# Guard Asterisk messages log size on production (run from cron on the host).
set -euo pipefail

CONTAINER="${PBX_ASTERISK_CONTAINER:-pbx-asterisk}"
MAX_BYTES="${PBX_ASTERISK_LOG_MAX_BYTES:-104857600}" # 100MB

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  exit 0
fi

size="$(docker exec "$CONTAINER" sh -c 'wc -c < /var/log/asterisk/messages 2>/dev/null || echo 0')"
if [ "${size:-0}" -gt "$MAX_BYTES" ]; then
  docker exec "$CONTAINER" sh -c ': > /var/log/asterisk/messages'
  logger -t pbx-asterisk-log-guard "truncated asterisk messages log (${size} bytes)"
fi

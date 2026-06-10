#!/bin/sh
set -eu

ARI_USER="${ASTERISK_ARI_USERNAME:-pbx_ari}"
ARI_PASS="${ASTERISK_ARI_PASSWORD:-change-me}"

if ! curl -sf -u "${ARI_USER}:${ARI_PASS}" "http://127.0.0.1:8088/asterisk/ari/asterisk/info" >/dev/null; then
  echo "Asterisk ARI health probe failed" >&2
  exit 1
fi

exit 0

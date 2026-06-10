#!/usr/bin/env bash
set -euo pipefail

poll_url() {
  local url="$1"
  local attempts="${2:-40}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

poll_cmd() {
  local attempts="${1:-40}"
  shift
  local i
  for ((i = 1; i <= attempts; i++)); do
    if "$@" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

service_line() {
  local name="$1"
  local status="$2"
  printf '  %-24s %s\n' "$name" "$status"
}

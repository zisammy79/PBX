#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

ACTION="${1:-status}"
FIXTURE_DIR="$ROOT/.local/demo/webhook"
CERT="$FIXTURE_DIR/cert.pem"
KEY="$FIXTURE_DIR/key.pem"
PID_FILE="$FIXTURE_DIR/server.pid"
PORT="${DEMO_WEBHOOK_PORT:-18443}"

ensure_cert() {
  mkdir -p "$FIXTURE_DIR"
  if [[ ! -f "$CERT" || ! -f "$KEY" ]]; then
    openssl req -x509 -newkey rsa:2048 -nodes \
      -keyout "$KEY" -out "$CERT" -days 365 \
      -subj "/CN=127.0.0.1" >/dev/null 2>&1
    chmod 600 "$KEY"
  fi
}

start_fixture() {
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    return 0
  fi
  ensure_cert
  RECEIVED_FILE="$FIXTURE_DIR/last-receipt.json"
  node "$ROOT/scripts/demo/webhook-fixture-server.mjs" \
    "$PORT" "$CERT" "$KEY" "$RECEIVED_FILE" >/dev/null 2>&1 &
  echo $! >"$PID_FILE"
  for _ in $(seq 1 20); do
    if curl -sk "https://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.25
  done
  echo "FAIL: webhook fixture did not start" >&2
  exit 1
}

stop_fixture() {
  if [[ -f "$PID_FILE" ]]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
}

case "$ACTION" in
  start) start_fixture ;;
  stop) stop_fixture ;;
  status)
    if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      echo "webhook fixture: running on https://127.0.0.1:${PORT}"
    else
      echo "webhook fixture: stopped"
    fi
    ;;
  *) echo "Usage: $0 {start|stop|status}"; exit 1 ;;
esac

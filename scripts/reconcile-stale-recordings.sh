#!/usr/bin/env bash
# Reconcile stale call recordings (starting/recording/processing on terminal calls).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RECORDING_ID="${1:-}"
CONTROLLER_URL="${TELEPHONY_CONTROLLER_URL:-http://127.0.0.1:8090}"

if [[ -n "$RECORDING_ID" ]]; then
  curl -sf -X POST "${CONTROLLER_URL}/internal/v1/recordings/reconcile/${RECORDING_ID}"
  echo
  exit 0
fi

curl -sf -X POST "${CONTROLLER_URL}/internal/v1/recordings/reconcile"
echo

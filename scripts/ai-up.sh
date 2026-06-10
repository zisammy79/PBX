#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
docker compose -f infrastructure/docker/docker-compose.yml -f infrastructure/docker/docker-compose.ai.yml up -d --build 2>/dev/null || {
  echo "Starting ai-media-gateway via go run (compose file optional)..."
  (cd services/ai-media-gateway && go run .) &
  sleep 2
}
echo "AI stack started on :${AI_MEDIA_GATEWAY_PORT:-8091}"

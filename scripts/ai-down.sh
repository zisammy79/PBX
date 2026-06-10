#!/usr/bin/env bash
set -euo pipefail
docker compose -f infrastructure/docker/docker-compose.yml -f infrastructure/docker/docker-compose.ai.yml down 2>/dev/null || pkill -f 'ai-media-gateway' 2>/dev/null || true
echo "AI stack stopped"

#!/usr/bin/env bash
# Runtime credential contract tests — no live external calls.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Runtime credential contract tests =="
npx pnpm@9.15.0 --filter @pbx/api test -- credential-runtime credential-resolver integrations
docker run --rm -v "$ROOT/services/ai-media-gateway:/app" -w /app golang:1.24-alpine go test ./internal/credentials/... ./internal/session/...
echo "RUNTIME_CREDENTIAL_CONTRACT: PASS"

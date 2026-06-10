#!/usr/bin/env bash
# Build a clean source archive for release staging (no credentials or runtime data).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RELEASE_ROOT="${RELEASE_ROOT:-/home/media/Downloads/.pbx-releases}"
RELEASE_ID="${RELEASE_ID:-pbx-non-ai-$(date -u +%Y%m%dT%H%M%SZ)}"
ARCHIVE="${RELEASE_ROOT}/${RELEASE_ID}.tar.zst"
CHECKSUM="${ARCHIVE}.sha256"

mkdir -p "$RELEASE_ROOT"

tar -C "$(dirname "$ROOT")" \
  --exclude='pbx/node_modules' \
  --exclude='pbx/**/node_modules' \
  --exclude='pbx/**/dist' \
  --exclude='pbx/**/.next' \
  --exclude='pbx/**/coverage' \
  --exclude='pbx/.env' \
  --exclude='pbx/.env.*' \
  --exclude='pbx/.env.production' \
  --exclude='pbx/var' \
  --exclude='pbx/recordings' \
  --exclude='pbx/uploads' \
  --exclude='pbx/.terraform' \
  --exclude='pbx/**/*.tfstate' \
  --exclude='pbx/**/*.tfstate.*' \
  --exclude='pbx/**/*.tfvars' \
  --exclude='pbx/**/*.pcap' \
  --exclude='pbx/**/*.pcapng' \
  --exclude='pbx/**/.local' \
  --exclude='pbx/infrastructure/asterisk/secrets' \
  --exclude='pbx/infrastructure/asterisk/generated/active/*.conf' \
  --exclude='pbx/.stage7-provision.*' \
  -cf - pbx | zstd -19 -T0 -o "$ARCHIVE"

sha256sum "$ARCHIVE" > "$CHECKSUM"
echo "RELEASE_ID=${RELEASE_ID}"
echo "ARCHIVE=${ARCHIVE}"
echo "CHECKSUM=${CHECKSUM}"

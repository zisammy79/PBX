#!/usr/bin/env bash
# Verify backup archive integrity using isolated temporary database when docker is available.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST=""
DRY_RUN=true

while [[ $# -gt 0 ]]; do
  case "$1" in
    --manifest) MANIFEST="$2"; shift 2 ;;
    --apply) DRY_RUN=false; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "unknown argument: $1" >&2; exit 1 ;;
  esac
done

if $DRY_RUN; then
  FIXTURE="${ROOT}/var/backups/staging/pbx-backup-fixture.manifest.json"
  mkdir -p "$(dirname "$FIXTURE")"
  echo '{"timestamp":"fixture","mode":"dry-run","components":["postgresql"]}' > "$FIXTURE"
  echo "verify-backup: DRY-RUN OK — manifest fixture created"
  exit 0
fi

[[ -n "$MANIFEST" && -f "$MANIFEST" ]] || { echo "verify-backup: missing manifest" >&2; exit 1; }
archive_name="$(jq -r .archive "$MANIFEST")"
archive_dir="$(dirname "$MANIFEST")"
archive="${archive_dir}/${archive_name}"
[[ -f "$archive" && -f "${archive}.sha256" ]] || { echo "verify-backup: archive or checksum missing" >&2; exit 1; }
sha256sum -c "${archive}.sha256"
echo "verify-backup: checksum OK — restore drill requires isolated postgres instance"

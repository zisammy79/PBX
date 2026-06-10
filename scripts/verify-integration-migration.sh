#!/usr/bin/env bash
# Verify integration migration tables exist.
set -euo pipefail
TABLES=(
  integration_connections
  integration_credential_versions
  integration_assignments
  integration_validations
  integration_audit_events
)
for table in "${TABLES[@]}"; do
  if ! docker exec pbx-postgres psql -U pbx -d pbx -tAc "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${table}'" | grep -q 1; then
    echo "MIGRATION_VERIFY: missing table ${table}" >&2
    exit 1
  fi
done
echo "MIGRATION_VERIFY: PASS (${#TABLES[@]} tables)"

# Backup and Restore

**Status:** Scripts implemented — verify in staging before relying on RPO/RTO.

## Components

| Component | Backup | Restore notes |
|-----------|--------|-----------------|
| PostgreSQL | `pg_dump` custom format, encrypted | Requires `--destructive --confirm RESTORE` |
| Generated Asterisk config | tarball | Copy from backup staging |
| Caddy config | tarball | Redeploy from repo or backup |
| Redis | Documented | Ephemeral cache + optional AOF — rebuild acceptable |
| NATS JetStream | Documented | Replay from DB/events where needed |
| Object storage | S3/Spaces lifecycle | Bucket versioning recommended |

## Backup

```bash
bash scripts/backup-production.sh --dry-run
bash scripts/backup-production.sh --apply
bash scripts/verify-backup.sh --dry-run
```

Outputs under `var/backups/staging/`:

- `pbx-backup-<timestamp>.tar.zst` (AES-256 encrypted)
- `.sha256` checksum sidecar
- `.manifest.json`

Configure optional upload:

- `BACKUP_S3_ENDPOINT`
- `BACKUP_S3_BUCKET`
- Operator-supplied credentials (not embedded in scripts)

## Restore

```bash
bash scripts/restore-production.sh --dry-run
bash scripts/restore-production.sh --apply \
  --archive var/backups/staging/pbx-backup-YYYYMMDD.tar.zst \
  --confirm RESTORE \
  --destructive
```

Safeguards:

- Checksum validation
- Explicit `--confirm RESTORE`
- `--destructive` required to overwrite live database
- No automatic reversal of forward-only migrations

## RPO / RTO (operational targets — not guarantees)

| Goal | Default target | Configuration |
|------|----------------|---------------|
| RPO | 24 hours | Daily backup timer + optional pre-deploy backup |
| RTO | 4 hours | Single-node restore + Reserved IP reassignment |

Validate with periodic restore drills using isolated PostgreSQL.

## Retention

`BACKUP_RETENTION_DAYS` (default 30) — local staging cleanup in backup script.

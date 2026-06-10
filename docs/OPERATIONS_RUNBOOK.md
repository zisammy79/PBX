# Operations Runbook

**Status:** Production operations guide (Slice G)

## Daily checks

```bash
bash scripts/validate-deployment-assets.sh --health-only
docker compose -f infrastructure/docker/docker-compose.production.yml ps
curl -fsS https://${API_DOMAIN}/api/v1/health/ready
```

## Access

| Component | Access |
|-----------|--------|
| Web UI | `https://${WEB_DOMAIN}` |
| API | `https://${API_DOMAIN}/api/v1` |
| Grafana | SSH tunnel: `ssh -L 3005:127.0.0.1:3005 admin@${PUBLIC_IP}` |
| Prometheus | SSH tunnel: `ssh -L 9090:127.0.0.1:9090 admin@${PUBLIC_IP}` |

Grafana and Prometheus are **not** publicly exposed.

## Persistent storage layout

| Path (host) | Owner | Purpose |
|-------------|-------|---------|
| `/var/lib/pbx/postgres` | pbx | PostgreSQL data |
| `/var/lib/pbx/redis` | pbx | Redis AOF (when enabled) |
| `/var/lib/pbx/nats` | pbx | NATS JetStream |
| `/var/lib/pbx/minio` | pbx | Local object storage (profile) |
| `/var/lib/pbx/recordings` | pbx | Call recording staging |
| `/var/lib/pbx/voicemail` | pbx | Voicemail payloads |
| `/var/lib/pbx/asterisk/generated` | pbx | Generated Asterisk configs |
| `/var/lib/pbx/asterisk/logs` | pbx | Asterisk logs / CDR |
| `/var/lib/pbx/backups/staging` | root | Encrypted backup staging |
| `/var/lib/pbx/caddy/{data,config}` | root | TLS certificates |

Docker named volumes mirror these paths when block storage is not mounted.

## Upgrade

```bash
bash scripts/backup-production.sh --apply
bash scripts/deploy-production.sh --dry-run --env-file .env.production
bash scripts/deploy-production.sh --apply --env-file .env.production
```

Rollback point: previous image tags + `scripts/rollback-production.sh --apply --confirm ROLLBACK`.

## Maintenance mode

Place Caddy maintenance snippet or scale web/api to zero — document operator choice before customer-facing maintenance.

## Logs

- Application: Docker json-file (50m × 5)
- Asterisk: `/var/log/asterisk` volume + logrotate
- Caddy: container `/var/log/caddy` with Authorization redaction

## Common issues

| Symptom | Check |
|---------|-------|
| API unhealthy | JWT/encryption secrets, DATABASE_URL, migrate job |
| ARI disconnected | asterisk container, internal DNS, ARI credentials |
| SIP no audio | RTP range 10000–10099 open in Cloud + host firewall |
| TLS failure | DNS → Reserved IP, ports 80/443, TLS_EMAIL |
| Webhooks failing | worker container, NATS, WEBHOOK_SIGNING_SECRET |

## Security

See [SECURITY_OPERATIONS.md](./SECURITY_OPERATIONS.md).

## Limitations

- Single-node — no automatic failover
- External AI not connected
- Stripe disabled

# Capacity Planning

**Status:** Conservative sizing model — **live load testing required** before customer concurrency commitments.

## Initial production profile (single Droplet)

| Resource | Example size | Notes |
|----------|--------------|-------|
| Droplet | 4 vCPU / 8 GB RAM | `s-4vcpu-8gb` |
| Block storage | 200 GB | PostgreSQL + recordings staging |
| RTP range | 100 ports | 10000–10099 UDP |

## Concurrent calls (G.711, no transcoding)

| Profile | vCPU | RAM | Estimated concurrent calls |
|---------|------|-----|----------------------------|
| Development | 2 | 4 GB | ~20 |
| Initial production | 4 | 8 GB | ~50–80 |
| Medium | 8 | 16 GB | ~150–200 |

AI realtime sessions consume significantly more CPU and bandwidth than plain extension calls.

## Storage drivers

| Driver | Estimate | Variables |
|--------|----------|-----------|
| Call recordings | ~1 MB/min G.711 mono | `recording_enabled`, retention days |
| Voicemail | similar to recordings | tenant usage |
| PostgreSQL | ~500 MB baseline + growth | tenants, CDR, webhooks, audit |
| Webhook history | ~2 KB/delivery | retry policy, retention |
| AI diagnostics | deferred | external AI not connected |
| Backups | DB size × retention | `BACKUP_RETENTION_DAYS` |

Example: 50 concurrent channels, 20% recorded, 90-day retention → plan **≥100 GB** object storage plus DB volume headroom.

## Load factors

- Transcoding (G.711 ↔ Opus)
- Call recording upload throughput
- AI media gateway sessions (deferred provider)
- Webhook fan-out and worker concurrency
- UI/API request rate

## Network

- RTP: ~80 kbps per G.711 leg × 2 legs per call
- SIP signaling comparatively small
- Reserve narrow RTP range consistent across Asterisk and firewall

## Validation requirement

Do not publish customer concurrency SLAs until:

1. SIP load test on production-like Droplet
2. Recording + webhook soak test
3. Disk and CPU monitoring under peak synthetic load

See `scripts/validate-deployment-assets.sh` for asset checks — not load tests.

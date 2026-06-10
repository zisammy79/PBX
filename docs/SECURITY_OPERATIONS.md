# Security Operations

## Edge exposure

Cloud Firewall and host nftables policy must stay synchronized. Validate with:

```bash
bash scripts/validate-public-ports.sh .env.production
```

## SSH

- Key-based authentication only (bootstrap does not enable password auth)
- Restricted to `admin_cidrs`
- fail2ban enabled on SSH

## Secrets

- Never commit `.env.production`, `terraform.tfvars`, or Ansible vault passwords
- Rotate on compromise: JWT, ENCRYPTION_MASTER_KEY, ARI, DB, S3, BACKUP_ENCRYPTION_KEY
- `scripts/secret-scan.sh` in CI

## TLS

- Caddy automatic certificates
- HSTS after TLS confirmed
- Access logs redact Authorization and Cookie headers

## Telephony

- ARI and Asterisk HTTP internal only
- SIP provider CIDR restrictions configurable
- No default extension passwords in production templates
- Emergency calling not enabled

## Monitoring access

Prometheus and Grafana bind `127.0.0.1` — use SSH tunnel only.

## Deferred attack surface

- WebRTC/TURN not deployed
- External AI provider keys unset
- Stripe webhooks disabled

## Audit

Structured application logs with correlation IDs. No credential or raw Authorization logging.

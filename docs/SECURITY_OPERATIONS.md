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

### Bootstrap secrets (environment/KMS only — not UI-managed)

`DATABASE_URL`, database passwords, `ENCRYPTION_MASTER_KEY`, JWT signing secret, `INTERNAL_SERVICE_TOKEN`, ARI administrative credentials, backup encryption root key, Docker/host credentials, Terraform bootstrap credentials.

### External integration credentials (Platform Owner UI)

Configure OpenAI, SIP carriers, and Stripe in **Platform Administration → Integrations**. Credentials are envelope-encrypted in the database; read APIs never return plaintext. See [INTEGRATION_CREDENTIAL_MANAGEMENT.md](./INTEGRATION_CREDENTIAL_MANAGEMENT.md).

Optional environment fallback: set `ALLOW_INTEGRATION_ENV_FALLBACK=true` and populate `.env.production.local` — not recommended for production.

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

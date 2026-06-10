# DigitalOcean Deployment

**Status:** Assets complete — **DIGITALOCEAN_DEPLOYMENT: NOT_PERFORMED**

Slice G delivers Terraform, Ansible bootstrap, production Compose, and validation scripts. No DigitalOcean resources were created in this repository pass.

## Topology (single node)

```text
Internet
  → DigitalOcean Cloud Firewall
  → Reserved IP
  → Ubuntu LTS Droplet
      → Caddy (80/443)
      → web / api / worker
      → PostgreSQL / Redis / NATS / MinIO or Spaces
      → Asterisk + telephony-controller + ai-media-gateway
      → rating-engine (health scaffold)
      → Prometheus + Grafana (localhost / SSH tunnel)
```

**Failure domain:** entire platform on one Droplet. Loss of the node stops all calls, API, and UI until restore or rebuild. Reserved IP simplifies DNS and SIP re-advertisement after rebuild but is **not** high availability.

## Prerequisites

- DigitalOcean account and API token (operator supplied)
- SSH key registered in DigitalOcean
- Domain with managed DNS (optional)
- Provider SIP CIDR ranges documented

## Terraform

```bash
cd infrastructure/terraform/digitalocean
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars — never commit

docker run --rm -v "$PWD:/workspace" -w /workspace hashicorp/terraform:1.9.8 init
docker run --rm -v "$PWD:/workspace" -w /workspace hashicorp/terraform:1.9.8 plan
# terraform apply — operator only, outside CI
```

Resources: Droplet, Reserved IP, Cloud Firewall, optional volume, optional DNS A records.

## Bootstrap

```bash
cd infrastructure/ansible
cp inventory.example.yml inventory.yml
cp group_vars/all.example.yml group_vars/all.yml
ansible-playbook -i inventory.yml site.yml
```

Secrets via Ansible Vault or environment injection — no secrets in git.

## Production stack

```bash
cp .env.production.example .env.production
# fill all REPLACE_* values

bash scripts/validate-production-env.sh .env.production
bash scripts/deploy-production.sh --dry-run --env-file .env.production
bash scripts/deploy-production.sh --apply --env-file .env.production
```

## Public ports

| Port | Protocol | Purpose |
|------|----------|---------|
| 22 | TCP | SSH (admin CIDRs only) |
| 80 | TCP | ACME + HTTPS redirect |
| 443 | TCP | Web + API + WSS |
| 5060 | UDP/TCP | SIP (configurable CIDRs) |
| 5061 | TCP | SIP TLS (optional) |
| 10000–10099 | UDP | RTP (narrow range) |

Internal-only: PostgreSQL, Redis, NATS, ARI, MinIO admin, service health ports.

## SIP configuration

Set `sip_allowed_cidrs` in Terraform and matching provider ranges at the host firewall. Default examples use `0.0.0.0/0` placeholders — **restrict before production traffic**.

## Deferred / disabled

- EXTERNAL_AI_CONNECTION: **DEFERRED**
- EXTERNAL_AI_VERIFICATION: **NOT_TESTED**
- STRIPE_STATUS: **DISABLED**
- WEBRTC / TURN: **DEFERRED**
- HIGH_AVAILABILITY: **NOT_IMPLEMENTED**
- PSTN_PRODUCTION_VERIFICATION: **NOT_PERFORMED**

## Emergency calling

Not enabled. Requires carrier, validated service address, regulatory process, and explicit operator configuration.

## Validation

```bash
bash scripts/validate-deployment-assets.sh
bash infrastructure/tests/deployment-validation.test.sh
```

Expected: all steps PASS without contacting DigitalOcean.

# Disaster Recovery

**HIGH_AVAILABILITY: NOT_IMPLEMENTED** — single Droplet failure domain.

## Scenarios

| Event | Recovery order | Manual decisions |
|-------|----------------|------------------|
| Full Droplet loss | Provision Droplet → assign Reserved IP → Ansible bootstrap → restore backup → deploy | New Droplet size, secret rotation |
| Reserved IP reassignment | Attach IP to replacement Droplet | DNS TTL, SIP provider notification |
| Database loss | Stop writes → restore latest verified backup → migrate if needed | Accept RPO window |
| Object storage loss | Restore bucket from off-site replica or accept recording loss | Customer communication |
| Config deletion | Redeploy from git + restore generated Asterisk from backup | — |
| Certificate loss | Caddy re-issue via ACME | Ensure port 80 reachable |
| Secret compromise | Rotate JWT, encryption, ARI, DB passwords, redeploy | Invalidate sessions |
| Asterisk failure | Restart container; rollback generated config LKG | — |
| Corrupted deployment | `rollback-production.sh` + image pin restore | Database may need separate restore |

## Prerequisites

- Recent encrypted backup + verified checksum
- `terraform.tfvars` and `.env.production` stored securely outside the Droplet
- DNS access
- Provider SIP trunk credentials

## Recovery validation checklist

- [ ] `validate-deployment-assets.sh` passes
- [ ] API `/health/ready` OK
- [ ] Asterisk `/healthcheck.sh` OK
- [ ] ARI connected (telephony-controller ready)
- [ ] Controlled SIP test call (operator)
- [ ] Worker processing webhooks
- [ ] Backup job succeeds post-recovery

## RPO / RTO

Configurable operational goals — see [BACKUP_RESTORE.md](./BACKUP_RESTORE.md). Live measurement required; not contractual guarantees.

## Automatic failover

Not available. Multi-node Kamailio/RTPengine clustering remains future work.

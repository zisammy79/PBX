# Incident Response

**Status:** Stub — expand in Stage 12.

## Severity levels

| Level | Example | Response |
|-------|---------|----------|
| S1 | Active toll fraud, total outage | Immediate isolate, suspend tenants |
| S2 | AI provider outage, partial SIP failure | Failover, customer comms |
| S3 | Degraded health, webhook backlog | Monitor, schedule fix |

## Immediate actions (toll fraud)

1. Suspend affected tenant via platform admin
2. Block source IPs at firewall
3. Revoke compromised SIP credentials
4. Preserve audit logs and CDR

## Contacts

Define on-call rotation before production launch.

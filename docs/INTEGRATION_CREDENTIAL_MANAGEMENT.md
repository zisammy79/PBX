# Integration Credential Management

## Overview

External runtime integration credentials are managed through **Platform Administration → Integrations**. Bootstrap secrets required to start or decrypt the platform remain environment/KMS managed only.

## UI-managed integrations

| Integration | Platform UI path | Tenant override |
|-------------|-------------------|-----------------|
| OpenAI Realtime | `/platform/integrations/ai` | Tenant AI provider connections |
| SIP carrier | `/platform/integrations/sip-carriers` | Tenant SIP trunks + assignments |
| Stripe TEST/LIVE | `/platform/integrations/stripe` | Per-tenant billing profile mapping |

## Bootstrap secrets (NOT UI-managed)

```text
DATABASE_URL
database passwords
ENCRYPTION_MASTER_KEY
JWT signing secret
INTERNAL_SERVICE_TOKEN
ASTERISK ARI administrative credentials
BACKUP_ENCRYPTION_KEY
Docker/host credentials
Terraform/DigitalOcean bootstrap credentials
```

## Credential precedence

```text
1. Active tenant-specific assignment
2. Active tenant-owned credential (integration_connections scope=tenant)
3. Legacy tenant AI provider connection (ai_provider_connections)
4. Legacy tenant SIP trunk (sip_trunks)
5. Assigned platform credential
6. Platform default credential
7. Environment fallback (ALLOW_INTEGRATION_ENV_FALLBACK=true only)
8. Configuration error
```

## Encryption

- Secrets stored in `encrypted_payload` using AES-256-GCM envelope encryption (`@pbx/shared`)
- Credential versions retained in `integration_credential_versions` for rotation audit
- Read APIs never return plaintext secrets — only `credentialConfigured: true`

## Rotation

Use **Replace credential** or **Rotate** in Platform Administration. Previous versions are deactivated but retained for audit.

### SIP carrier validation levels

| Level | Endpoint | Description |
|-------|----------|-------------|
| CONFIGURATION | `POST /platform/integrations/:id/validate-configuration` | Non-billable field and syntax checks |
| NETWORK | `POST /platform/integrations/:id/validate-network` | SIP REGISTER or OPTIONS probe (no PSTN call) |

Network validation statuses: `REGISTERED`, `OPTIONS_REACHABLE`, `AUTHENTICATION_FAILED`, `UNREACHABLE`, `INVALID_CONFIGURATION`.

```text
NOT_CONFIGURED | CONFIGURED_NOT_TESTED | VALID | INVALID | DISABLED | ROTATION_REQUIRED
```

Connected status is shown only after successful validation.

## Environment fallback (optional)

Set `ALLOW_INTEGRATION_ENV_FALLBACK=true` to allow `.env.production.local` values when no UI credential exists. Recommended path is Platform Owner UI.

## Live verification scripts

Scripts resolve credential **metadata** via `POST /api/v1/internal/integrations/status` (never prints secrets):

```text
credentialSource
integrationId
credentialVersion
provider
environment
```

OpenAI live sessions resolve credentials inside the AI media gateway at runtime. PSTN and Stripe services use `CredentialResolverService`.

## Emergency revocation

Disable the integration in Platform Administration → Integrations or remove tenant assignments. Active sessions may fail on next credential resolution.

## Recovery

If `ENCRYPTION_MASTER_KEY` is lost, encrypted integration credentials cannot be recovered. Re-enter credentials through the UI after key restoration from KMS backup.

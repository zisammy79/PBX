# Webhooks

Outbound tenant webhooks deliver platform events over HTTPS with HMAC-SHA256 signatures.

## Event envelope

```json
{
  "id": "uuid",
  "type": "call.completed",
  "apiVersion": "v1",
  "tenantId": "uuid",
  "createdAt": "2026-06-09T12:00:00.000Z",
  "correlationId": "uuid",
  "data": {}
}
```

Payload `data` is tenant-scoped and excludes credentials, internal tokens, and raw provider headers.

## Supported events (operational)

These events are published today:

| Event | Source |
|-------|--------|
| `call.started` | Telephony NATS → worker |
| `call.ringing` | Telephony NATS → worker |
| `call.answered` | Telephony NATS → worker |
| `call.completed` | Telephony NATS → worker |
| `call.failed` | Telephony NATS → worker |
| `invoice.generated` | Billing API |
| `invoice.finalized` | Billing API |

## Deferred catalogue entries

Subscribing to these types is allowed but **no deliveries are emitted yet**:

| Event | Status |
|-------|--------|
| `ai.session.started` | DEFERRED — external AI not connected |
| `ai.session.completed` | DEFERRED |
| `ai.session.failed` | DEFERRED |
| `ai.transfer.completed` | DEFERRED |
| `usage.threshold.reached` | DEFERRED |
| `extension.registration.changed` | DEFERRED |

See `OPERATIONAL_WEBHOOK_EVENT_TYPES` and `DEFERRED_WEBHOOK_EVENT_TYPES` in `@pbx/contracts`.

## Signing

Headers:

- `X-PBX-Webhook-Id` — delivery ID
- `X-PBX-Webhook-Timestamp` — Unix seconds
- `X-PBX-Webhook-Signature` — `v1=<hex>`
- `X-PBX-Webhook-Attempt` — attempt number

Signing input:

```text
<timestamp>.<raw-request-body>
```

Verification pseudocode:

```text
expected = HMAC_SHA256(secret, timestamp + "." + rawBody)
compare constant-time(expected, headerSignature)
reject if abs(now - timestamp) > 300 seconds
```

Signing secrets are generated on endpoint create/rotate, shown once, and stored encrypted at rest.

## Retry schedule

| Attempt | Delay after previous failure |
|---------|------------------------------|
| 1 | immediate |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |
| 6 | 12 hours |

Permanent HTTP 4xx (except 429) → dead-letter. Network/timeout/5xx → retry until exhausted.

## Manual redelivery

`POST /api/v1/webhooks/{id}/deliveries/{deliveryId}/redeliver` creates a new delivery linked to the original event. Requires `TENANT_WEBHOOK_MANAGE`. Supports `Idempotency-Key`.

## URL security

Production endpoints must use HTTPS. Blocked by default:

- Credentials in URL
- Loopback and link-local addresses
- Private network targets (unless `WEBHOOK_DEV_ALLOWED_HOSTS` in development)
- DNS resolving to private IPs
- Redirect following

## Worker

`apps/worker` polls pending deliveries and subscribes to `tenant.*.calls.events` on NATS.

External AI verification remains **NOT_TESTED**. Stripe remains **DISABLED**.

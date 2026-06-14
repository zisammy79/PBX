import { pgEnum } from 'drizzle-orm/pg-core';

export const tenantStatusEnum = pgEnum('tenant_status', [
  'draft',
  'provisioning',
  'active',
  'suspended',
  'trial',
  'archived',
  'failed',
  'closed',
]);

export const userStatusEnum = pgEnum('user_status', ['active', 'invited', 'disabled']);

export const extensionStatusEnum = pgEnum('extension_status', ['active', 'disabled']);

export const sipTransportEnum = pgEnum('sip_transport', ['udp', 'tcp', 'tls', 'ws', 'wss']);

export const callDirectionEnum = pgEnum('call_direction', ['inbound', 'outbound', 'internal']);

export const callStatusEnum = pgEnum('call_status', [
  'initiating',
  'ringing',
  'answered',
  'held',
  'transferring',
  'completed',
  'failed',
  'cancelled',
]);

export const recordingStatusEnum = pgEnum('recording_status', [
  'pending',
  'recording',
  'processing',
  'available',
  'failed',
  'deleted',
]);

export const aiSessionStatusEnum = pgEnum('ai_session_status', [
  'connecting',
  'active',
  'transferring',
  'completed',
  'failed',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'cancelled',
  'suspended',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'open',
  'finalized',
  'paid',
  'void',
  'uncollectible',
  'payment_failed',
]);

export const webhookDeliveryStatusEnum = pgEnum('webhook_delivery_status', [
  'pending',
  'delivered',
  'failed',
  'dead_letter',
]);

export const providerHealthStatusEnum = pgEnum('provider_health_status', [
  'healthy',
  'degraded',
  'unhealthy',
  'unknown',
]);

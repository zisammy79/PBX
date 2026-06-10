import { z } from 'zod';

export const WebhookEventTypeSchema = z.enum([
  'call.started',
  'call.ringing',
  'call.answered',
  'call.completed',
  'call.failed',
  'ai.session.started',
  'ai.session.completed',
  'ai.session.failed',
  'ai.transfer.completed',
  'usage.threshold.reached',
  'invoice.generated',
  'invoice.finalized',
  'extension.registration.changed',
]);

export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;

export const ALL_WEBHOOK_EVENT_TYPES = WebhookEventTypeSchema.options;

export const CreateWebhookEndpointSchema = z.object({
  url: z.string().url().max(2048),
  description: z.string().max(2000).optional(),
  eventTypes: z.array(WebhookEventTypeSchema).min(1),
  isActive: z.boolean().optional(),
});

export const UpdateWebhookEndpointSchema = z.object({
  url: z.string().url().max(2048).optional(),
  description: z.string().max(2000).nullable().optional(),
  eventTypes: z.array(WebhookEventTypeSchema).min(1).optional(),
  isActive: z.boolean().optional(),
});

export const WebhookEventEnvelopeSchema = z.object({
  id: z.string().uuid(),
  type: WebhookEventTypeSchema,
  apiVersion: z.literal('v1'),
  tenantId: z.string().uuid(),
  createdAt: z.string().datetime(),
  correlationId: z.string().uuid().optional(),
  data: z.record(z.unknown()),
});

export type WebhookEventEnvelope = z.infer<typeof WebhookEventEnvelopeSchema>;

/** Events with live publishers in the non-AI platform release. */
export const OPERATIONAL_WEBHOOK_EVENT_TYPES = [
  'call.started',
  'call.ringing',
  'call.answered',
  'call.completed',
  'call.failed',
  'invoice.generated',
  'invoice.finalized',
] as const satisfies readonly WebhookEventType[];

/** Catalogue entries reserved for future wiring — subscribing returns no deliveries yet. */
export const DEFERRED_WEBHOOK_EVENT_TYPES = [
  'ai.session.started',
  'ai.session.completed',
  'ai.session.failed',
  'ai.transfer.completed',
  'usage.threshold.reached',
  'extension.registration.changed',
] as const satisfies readonly WebhookEventType[];

/** Maps telephony NATS event types to webhook catalogue types. */
export const TELEPHONY_EVENT_MAP: Record<string, WebhookEventType> = {
  CREATED: 'call.started',
  RINGING: 'call.ringing',
  ANSWERED: 'call.answered',
  BRIDGED: 'call.answered',
  COMPLETE: 'call.completed',
  FAILED: 'call.failed',
};

export const WEBHOOK_RETRY_DELAYS_MS = [
  0,
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
] as const;

export const MAX_WEBHOOK_ATTEMPTS = WEBHOOK_RETRY_DELAYS_MS.length;

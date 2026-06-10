import { Inject, Injectable } from '@nestjs/common';
import type { WebhookEventType } from '@pbx/contracts';
import { WebhookEventEnvelopeSchema } from '@pbx/contracts';
import { and, eq } from 'drizzle-orm';
import {
  platformEvents,
  webhookDeliveries,
  webhookEndpoints,
  withBypassRls,
} from '@pbx/database';
import { DATABASE } from '../../common/tokens.js';

@Injectable()
export class EventPublicationService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async publish(
    tenantId: string,
    eventType: WebhookEventType,
    data: Record<string, unknown>,
    correlationId?: string,
  ) {
    return withBypassRls(this.database.db, async (db) => {
      const [event] = await db
        .insert(platformEvents)
        .values({
          tenantId,
          eventType,
          correlationId: correlationId ?? null,
          payload: data,
        })
        .returning();

      const envelope = WebhookEventEnvelopeSchema.parse({
        id: event!.id,
        type: eventType,
        apiVersion: 'v1',
        tenantId,
        createdAt: event!.createdAt.toISOString(),
        correlationId: correlationId ?? undefined,
        data,
      });

      const endpoints = await db
        .select()
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.tenantId, tenantId), eq(webhookEndpoints.isActive, true)));

      for (const endpoint of endpoints) {
        if (!endpoint.eventTypes.includes(eventType)) continue;
        await db
          .insert(webhookDeliveries)
          .values({
            tenantId,
            endpointId: endpoint.id,
            eventId: event!.id,
            eventType,
            payload: envelope,
            status: 'pending',
            nextAttemptAt: new Date(),
            correlationId: correlationId ?? null,
            secretVersion: endpoint.secretVersion,
          })
          .onConflictDoNothing();
      }

      return envelope;
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import {
  CreateWebhookEndpointSchema,
  notFound,
  UpdateWebhookEndpointSchema,
  validationError,
} from '@pbx/contracts';
import { encryptSecret, generateWebhookSigningSecret, redactObject } from '@pbx/shared';
import { and, desc, eq } from 'drizzle-orm';
import {
  auditEvents,
  webhookDeliveries,
  webhookEndpoints,
  withTenantContext,
} from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { IdempotencyService } from '../../common/services/idempotency.service.js';
import { QuotaService } from '../../common/services/quota.service.js';
import { validateOutboundWebhookUrl } from './webhook-url-validator.js';

@Injectable()
export class WebhooksService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
    @Inject(QuotaService) private readonly quotas: QuotaService,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  private devAllowedHosts(): string[] {
    const raw = process.env.WEBHOOK_DEV_ALLOWED_HOSTS ?? '';
    return raw
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
  }

  async create(actor: AuthenticatedUser, tenantId: string, body: unknown, idempotencyKey?: string) {
    const input = CreateWebhookEndpointSchema.parse(body);

    const result = await this.idempotency.execute(
      tenantId,
      'webhooks:create',
      idempotencyKey,
      input,
      async () => {
        await this.quotas.assertCanCreateWebhook(tenantId);
        const normalizedUrl = await validateOutboundWebhookUrl(input.url, this.devAllowedHosts());
        const signingSecret = generateWebhookSigningSecret();

        const payload = await withTenantContext(this.database.db, tenantId, async (db) => {
          const [endpoint] = await db
            .insert(webhookEndpoints)
            .values({
              tenantId,
              url: normalizedUrl,
              description: input.description ?? null,
              eventTypes: input.eventTypes,
              isActive: input.isActive ?? true,
              secretEncrypted: encryptSecret(signingSecret, this.config.encryptionMasterKey),
              secretVersion: 1,
            })
            .returning();

          await this.audit(db, tenantId, actor.id, 'webhook.endpoint.created', endpoint!.id, {
            url: normalizedUrl,
          });

          return {
            endpoint: this.serializeEndpoint(endpoint!),
            signingSecret,
          };
        });

        return { status: 201, body: payload };
      },
    );

    return result.body;
  }

  async list(actor: AuthenticatedUser, tenantId: string) {
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.tenantId, tenantId))
        .orderBy(desc(webhookEndpoints.createdAt));
      return rows.map((row) => this.serializeEndpoint(row));
    });
  }

  async get(actor: AuthenticatedUser, tenantId: string, id: string) {
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.tenantId, tenantId), eq(webhookEndpoints.id, id)))
        .limit(1);
      if (!row) throw notFound('Webhook endpoint');
      return this.serializeEndpoint(row);
    });
  }

  async update(actor: AuthenticatedUser, tenantId: string, id: string, body: unknown) {
    const input = UpdateWebhookEndpointSchema.parse(body);
    const normalizedUrl = input.url
      ? await validateOutboundWebhookUrl(input.url, this.devAllowedHosts())
      : undefined;

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.tenantId, tenantId), eq(webhookEndpoints.id, id)))
        .limit(1);
      if (!existing) throw notFound('Webhook endpoint');

      const [updated] = await db
        .update(webhookEndpoints)
        .set({
          ...(normalizedUrl ? { url: normalizedUrl } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.eventTypes !== undefined ? { eventTypes: input.eventTypes } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(eq(webhookEndpoints.id, id))
        .returning();

      await this.audit(db, tenantId, actor.id, 'webhook.endpoint.updated', id, {});
      return this.serializeEndpoint(updated!);
    });
  }

  async remove(actor: AuthenticatedUser, tenantId: string, id: string) {
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.tenantId, tenantId), eq(webhookEndpoints.id, id)))
        .limit(1);
      if (!existing) throw notFound('Webhook endpoint');
      await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
      await this.audit(db, tenantId, actor.id, 'webhook.endpoint.deleted', id, {});
      return { deleted: true };
    });
  }

  async rotateSecret(actor: AuthenticatedUser, tenantId: string, id: string) {
    const signingSecret = generateWebhookSigningSecret();
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(webhookEndpoints)
        .where(and(eq(webhookEndpoints.tenantId, tenantId), eq(webhookEndpoints.id, id)))
        .limit(1);
      if (!existing) throw notFound('Webhook endpoint');

      const [updated] = await db
        .update(webhookEndpoints)
        .set({
          secretEncrypted: encryptSecret(signingSecret, this.config.encryptionMasterKey),
          secretVersion: existing.secretVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(webhookEndpoints.id, id))
        .returning();

      await this.audit(db, tenantId, actor.id, 'webhook.secret.rotated', id, {
        secretVersion: updated!.secretVersion,
      });

      return {
        endpoint: this.serializeEndpoint(updated!),
        signingSecret,
      };
    });
  }

  async listDeliveries(actor: AuthenticatedUser, tenantId: string, endpointId: string) {
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db
        .select()
        .from(webhookDeliveries)
        .where(and(eq(webhookDeliveries.tenantId, tenantId), eq(webhookDeliveries.endpointId, endpointId)))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(100);
      return rows.map((row) => this.serializeDelivery(row));
    });
  }

  async getDelivery(actor: AuthenticatedUser, tenantId: string, endpointId: string, deliveryId: string) {
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(webhookDeliveries)
        .where(
          and(
            eq(webhookDeliveries.tenantId, tenantId),
            eq(webhookDeliveries.endpointId, endpointId),
            eq(webhookDeliveries.id, deliveryId),
          ),
        )
        .limit(1);
      if (!row) throw notFound('Webhook delivery');
      return this.serializeDelivery(row);
    });
  }

  async redeliver(
    actor: AuthenticatedUser,
    tenantId: string,
    endpointId: string,
    deliveryId: string,
    idempotencyKey?: string,
  ) {
    const result = await this.idempotency.execute(
      tenantId,
      `webhooks:redeliver:${deliveryId}`,
      idempotencyKey,
      {},
      async () => {
        const payload = await withTenantContext(this.database.db, tenantId, async (db) => {
          const [source] = await db
            .select()
            .from(webhookDeliveries)
            .where(
              and(
                eq(webhookDeliveries.tenantId, tenantId),
                eq(webhookDeliveries.endpointId, endpointId),
                eq(webhookDeliveries.id, deliveryId),
              ),
            )
            .limit(1);
          if (!source) throw notFound('Webhook delivery');

          const [endpoint] = await db
            .select()
            .from(webhookEndpoints)
            .where(eq(webhookEndpoints.id, endpointId))
            .limit(1);
          if (!endpoint) throw notFound('Webhook endpoint');

          const [created] = await db
            .insert(webhookDeliveries)
            .values({
              tenantId,
              endpointId,
              eventId: source.eventId,
              eventType: source.eventType,
              payload: source.payload,
              status: 'pending',
              nextAttemptAt: new Date(),
              correlationId: source.correlationId,
              secretVersion: endpoint.secretVersion,
              redeliverySourceId: source.id,
            })
            .returning();

          await this.audit(db, tenantId, actor.id, 'webhook.delivery.redeliver', created!.id, {
            sourceDeliveryId: deliveryId,
          });

          return this.serializeDelivery(created!);
        });
        return { status: 202, body: payload };
      },
    );

    return result.body;
  }

  private serializeEndpoint(row: typeof webhookEndpoints.$inferSelect) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      url: row.url,
      description: row.description,
      isActive: row.isActive,
      eventTypes: row.eventTypes,
      secretVersion: row.secretVersion,
      lastSuccessfulDeliveryAt: row.lastSuccessfulDeliveryAt?.toISOString() ?? null,
      lastFailedDeliveryAt: row.lastFailedDeliveryAt?.toISOString() ?? null,
      failureCount: row.failureCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializeDelivery(row: typeof webhookDeliveries.$inferSelect) {
    return {
      id: row.id,
      endpointId: row.endpointId,
      eventId: row.eventId,
      eventType: row.eventType,
      status: row.status,
      attemptCount: row.attemptCount,
      lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
      nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
      responseStatus: row.responseStatus,
      responseBodyExcerpt: row.responseBody ? row.responseBody.slice(0, 500) : null,
      durationMs: row.durationMs,
      errorCategory: row.errorCategory,
      correlationId: row.correlationId,
      secretVersion: row.secretVersion,
      redeliverySourceId: row.redeliverySourceId,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async audit(
    db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
    tenantId: string,
    actorId: string,
    action: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ) {
    await db.insert(auditEvents).values({
      tenantId,
      actorUserId: actorId.startsWith('apikey:') ? null : actorId,
      actorType: actorId.startsWith('apikey:') ? 'api_key' : 'user',
      action,
      resourceType: 'webhook',
      resourceId,
      metadata: redactObject(metadata),
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import {
  CreateApiApplicationSchema,
  CreateApiKeySchema,
  notFound,
  RotateApiKeySchema,
  tenantAccessDenied,
  UpdateApiApplicationSchema,
  validationError,
  assertValidApiScopes,
} from '@pbx/contracts';
import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  apiApplications,
  apiKeys,
  auditEvents,
  withTenantContext,
} from '@pbx/database';
import { DATABASE } from '../../common/tokens.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { ApiKeyAuthService } from './api-key-auth.service.js';
import { IdempotencyService } from '../../common/services/idempotency.service.js';
import { QuotaService } from '../../common/services/quota.service.js';

@Injectable()
export class ApiApplicationsService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
    @Inject(QuotaService) private readonly quotas: QuotaService,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  async createApplication(actor: AuthenticatedUser, tenantId: string, body: unknown) {
    const input = CreateApiApplicationSchema.parse(body);
    assertValidApiScopes(input.scopes);
    await this.quotas.assertCanCreateApplication(tenantId);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [app] = await db
        .insert(apiApplications)
        .values({
          tenantId,
          name: input.name,
          description: input.description ?? null,
          scopes: input.scopes,
          createdByUserId: actor.authMethod === 'api_key' ? null : actor.id,
        })
        .returning();
      await this.audit(db, tenantId, actor.id, 'api.application.created', app!.id, { name: input.name });
      return this.serializeApplication(app!);
    });
  }

  async listApplications(actor: AuthenticatedUser, tenantId: string) {
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db
        .select()
        .from(apiApplications)
        .where(eq(apiApplications.tenantId, tenantId))
        .orderBy(desc(apiApplications.createdAt));
      return rows.map((row) => this.serializeApplication(row));
    });
  }

  async getApplication(actor: AuthenticatedUser, tenantId: string, id: string) {
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(apiApplications)
        .where(and(eq(apiApplications.tenantId, tenantId), eq(apiApplications.id, id)))
        .limit(1);
      if (!row) throw notFound('API application');
      return this.serializeApplication(row);
    });
  }

  async updateApplication(actor: AuthenticatedUser, tenantId: string, id: string, body: unknown) {
    const input = UpdateApiApplicationSchema.parse(body);
    if (input.scopes) assertValidApiScopes(input.scopes);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(apiApplications)
        .where(and(eq(apiApplications.tenantId, tenantId), eq(apiApplications.id, id)))
        .limit(1);
      if (!existing) throw notFound('API application');

      const [updated] = await db
        .update(apiApplications)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.scopes !== undefined ? { scopes: input.scopes } : {}),
          updatedAt: new Date(),
        })
        .where(eq(apiApplications.id, id))
        .returning();
      await this.audit(db, tenantId, actor.id, 'api.application.updated', id, {});
      return this.serializeApplication(updated!);
    });
  }

  async deleteApplication(actor: AuthenticatedUser, tenantId: string, id: string) {
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(apiApplications)
        .where(and(eq(apiApplications.tenantId, tenantId), eq(apiApplications.id, id)))
        .limit(1);
      if (!existing) throw notFound('API application');
      await db.delete(apiApplications).where(eq(apiApplications.id, id));
      await this.audit(db, tenantId, actor.id, 'api.application.deleted', id, {});
      return { deleted: true };
    });
  }

  async createKey(
    actor: AuthenticatedUser,
    tenantId: string,
    applicationId: string,
    body: unknown,
  ) {
    const input = CreateApiKeySchema.parse(body);
    await this.quotas.assertCanCreateApiKey(tenantId, applicationId);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [app] = await db
        .select()
        .from(apiApplications)
        .where(and(eq(apiApplications.tenantId, tenantId), eq(apiApplications.id, applicationId)))
        .limit(1);
      if (!app) throw notFound('API application');
      if (!app.isActive) throw validationError({ application: 'Application is disabled' });

      const scopes = input.scopes ?? app.scopes;
      assertValidApiScopes(scopes);
      const material = ApiKeyAuthService.createKeyMaterial();

      const [key] = await db
        .insert(apiKeys)
        .values({
          tenantId,
          applicationId,
          name: input.displayName,
          keyPrefix: material.prefix,
          keyHash: material.hash,
          scopes,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          createdByUserId: actor.authMethod === 'api_key' ? null : actor.id,
        })
        .returning();

      await this.audit(db, tenantId, actor.id, 'api.key.created', key!.id, { applicationId });
      return {
        key: this.serializeKey(key!),
        secret: material.token,
      };
    });
  }

  async listKeys(actor: AuthenticatedUser, tenantId: string, applicationId: string) {
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.applicationId, applicationId)))
        .orderBy(desc(apiKeys.createdAt));
      return rows.map((row) => this.serializeKey(row));
    });
  }

  async rotateKey(
    actor: AuthenticatedUser,
    tenantId: string,
    applicationId: string,
    keyId: string,
    body: unknown,
    idempotencyKey?: string,
  ) {
    const input = RotateApiKeySchema.parse(body ?? {});

    const result = await this.idempotency.execute(
      tenantId,
      `api-keys:rotate:${keyId}`,
      idempotencyKey,
      input,
      async () => {
        const payload = await withTenantContext(this.database.db, tenantId, async (db) => {
          const [existing] = await db
            .select()
            .from(apiKeys)
            .where(
              and(
                eq(apiKeys.tenantId, tenantId),
                eq(apiKeys.applicationId, applicationId),
                eq(apiKeys.id, keyId),
              ),
            )
            .limit(1);
          if (!existing) throw notFound('API key');
          if (existing.revokedAt) throw validationError({ key: 'Key is revoked' });

          await db
            .update(apiKeys)
            .set({ revokedAt: new Date() })
            .where(eq(apiKeys.id, keyId));

          const material = ApiKeyAuthService.createKeyMaterial();
          const [created] = await db
            .insert(apiKeys)
            .values({
              tenantId,
              applicationId,
              name: input.displayName ?? existing.name,
              keyPrefix: material.prefix,
              keyHash: material.hash,
              scopes: existing.scopes,
              expiresAt: input.expiresAt ? new Date(input.expiresAt) : existing.expiresAt,
              rotatedFromKeyId: existing.id,
              createdByUserId: actor.authMethod === 'api_key' ? null : actor.id,
            })
            .returning();

          await this.audit(db, tenantId, actor.id, 'api.key.rotated', created!.id, {
            previousKeyId: keyId,
          });

          return {
            key: this.serializeKey(created!),
            secret: material.token,
            previousKeyId: keyId,
          };
        });
        return { status: 201, body: payload };
      },
    );

    return result.body;
  }

  async revokeKey(actor: AuthenticatedUser, tenantId: string, applicationId: string, keyId: string) {
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(apiKeys)
        .where(
          and(
            eq(apiKeys.tenantId, tenantId),
            eq(apiKeys.applicationId, applicationId),
            eq(apiKeys.id, keyId),
            isNull(apiKeys.revokedAt),
          ),
        )
        .limit(1);
      if (!existing) throw notFound('API key');

      const [updated] = await db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(eq(apiKeys.id, keyId))
        .returning();
      await this.audit(db, tenantId, actor.id, 'api.key.revoked', keyId, {});
      return this.serializeKey(updated!);
    });
  }

  private serializeApplication(row: typeof apiApplications.$inferSelect) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      description: row.description,
      scopes: row.scopes,
      status: row.isActive ? 'active' : 'disabled',
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializeKey(row: typeof apiKeys.$inferSelect) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      applicationId: row.applicationId,
      displayName: row.name,
      prefix: row.keyPrefix,
      scopes: row.scopes,
      status: row.revokedAt ? 'revoked' : row.expiresAt && row.expiresAt.getTime() <= Date.now() ? 'expired' : 'active',
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      rotatedFromKeyId: row.rotatedFromKeyId,
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
      resourceType: 'api_key',
      resourceId,
      metadata,
    });
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { notFound, tenantAccessDenied, validationError } from '@pbx/contracts';
import { encryptSecret, redactObject } from '@pbx/shared';
import { and, desc, eq } from 'drizzle-orm';
import {
  aiProviderConnections,
  auditEvents,
  withTenantContext,
} from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import type { CreateAiProviderConnection, UpdateAiProviderConnection } from '@pbx/contracts';

const SUPPORTED_PROVIDERS = new Set([
  'openai',
  'gemini',
  'azure_openai',
  'anthropic',
  'custom',
  'deterministic-test',
]);

const EXTERNAL_VALIDATION_DEFERRED = {
  status: 'NOT_TESTED' as const,
  reason: 'External provider verification deferred',
};

@Injectable()
export class AiProviderConnectionsService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async create(
    actor: AuthenticatedUser,
    tenantId: string,
    input: CreateAiProviderConnection,
  ) {
    await this.assertTenantAccess(actor, tenantId);
    if (!SUPPORTED_PROVIDERS.has(input.providerType)) {
      throw validationError({ providerType: 'Unsupported provider type' });
    }
    this.validateCredentialFormat(input.providerType, input.credentials);

    const encrypted = encryptSecret(
      JSON.stringify(input.credentials),
      this.config.encryptionMasterKey,
    );
    const now = new Date();

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .insert(aiProviderConnections)
        .values({
          tenantId,
          providerType: input.providerType,
          name: input.name,
          credentialsEncrypted: encrypted,
          credentialKeyVersion: 'v1',
          config: input.config ?? {},
          validationStatus: 'NOT_TESTED',
          createdBy: actor.id,
          updatedAt: now,
        })
        .returning();

      await this.audit(db, tenantId, actor.id, 'ai.provider_connection.created', row!.id, {
        providerType: input.providerType,
        name: input.name,
      });

      return this.serialize(row!, now);
    });
  }

  async list(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db
        .select()
        .from(aiProviderConnections)
        .where(eq(aiProviderConnections.tenantId, tenantId))
        .orderBy(desc(aiProviderConnections.createdAt));
      return rows.map((r) => this.serialize(r));
    });
  }

  async get(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(aiProviderConnections)
        .where(and(eq(aiProviderConnections.tenantId, tenantId), eq(aiProviderConnections.id, id)))
        .limit(1);
      if (!row) throw notFound('AI provider connection');
      return this.serialize(row);
    });
  }

  async update(
    actor: AuthenticatedUser,
    tenantId: string,
    id: string,
    input: UpdateAiProviderConnection,
  ) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(aiProviderConnections)
        .where(and(eq(aiProviderConnections.tenantId, tenantId), eq(aiProviderConnections.id, id)))
        .limit(1);
      if (!existing) throw notFound('AI provider connection');

      const now = new Date();
      const patch: Record<string, unknown> = { updatedAt: now };
      if (input.name !== undefined) patch.name = input.name;
      if (input.isActive !== undefined) patch.isActive = input.isActive;
      if (input.config !== undefined) patch.config = input.config;
      let credentialsUpdatedAt: Date | undefined;
      if (input.credentials !== undefined) {
        this.validateCredentialFormat(existing.providerType, input.credentials);
        patch.credentialsEncrypted = encryptSecret(
          JSON.stringify(input.credentials),
          this.config.encryptionMasterKey,
        );
        patch.validationStatus = 'NOT_TESTED';
        patch.lastValidatedAt = null;
        patch.validationError = null;
        const nextVersion = Number.parseInt(existing.credentialKeyVersion.replace(/\D/g, '') || '1', 10) + 1;
        patch.credentialKeyVersion = `v${nextVersion}`;
        credentialsUpdatedAt = now;
      }

      const [row] = await db
        .update(aiProviderConnections)
        .set(patch)
        .where(eq(aiProviderConnections.id, id))
        .returning();

      await this.audit(db, tenantId, actor.id, 'ai.provider_connection.updated', id, {
        fields: Object.keys(input),
        credentialRotated: input.credentials !== undefined,
      });

      return this.serialize(row!, credentialsUpdatedAt);
    });
  }

  async remove(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(aiProviderConnections)
        .where(and(eq(aiProviderConnections.tenantId, tenantId), eq(aiProviderConnections.id, id)))
        .limit(1);
      if (!existing) throw notFound('AI provider connection');

      await db
        .update(aiProviderConnections)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(aiProviderConnections.id, id));

      await this.audit(db, tenantId, actor.id, 'ai.provider_connection.disabled', id, {});
      return { id, disabled: true };
    });
  }

  async test(actor: AuthenticatedUser, tenantId: string, id: string) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(aiProviderConnections)
        .where(and(eq(aiProviderConnections.tenantId, tenantId), eq(aiProviderConnections.id, id)))
        .limit(1);
      if (!row) throw notFound('AI provider connection');

      await this.audit(db, tenantId, actor.id, 'ai.provider_connection.test_requested', id, {
        externalValidationStatus: 'NOT_TESTED',
      });

      return {
        ...EXTERNAL_VALIDATION_DEFERRED,
        providerType: row.providerType,
        connectionId: row.id,
        configured: Boolean(row.credentialsEncrypted),
        enabled: row.isActive,
      };
    });
  }

  private validateCredentialFormat(providerType: string, credentials: Record<string, unknown>) {
    if (providerType === 'deterministic-test') {
      return;
    }
    const requireString = (field: string) => {
      const value = credentials[field];
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw validationError({ credentials: `${field} is required` });
      }
    };
    switch (providerType) {
      case 'openai':
      case 'gemini':
      case 'anthropic':
        requireString('apiKey');
        break;
      case 'azure_openai':
        requireString('apiKey');
        requireString('endpoint');
        requireString('deployment');
        break;
      case 'custom':
        if (!credentials.apiKey && !credentials.headers) {
          throw validationError({ credentials: 'custom provider requires apiKey or headers' });
        }
        break;
      default:
        throw validationError({ providerType: 'Unsupported provider type' });
    }
  }

  private serialize(
    row: typeof aiProviderConnections.$inferSelect,
    credentialsUpdatedAt?: Date,
  ) {
    const externalValidationStatus =
      row.validationStatus === 'NOT_TESTED' || row.validationStatus === 'unknown'
        ? 'NOT_TESTED'
        : 'NOT_TESTED';

    return {
      id: row.id,
      tenantId: row.tenantId,
      providerType: row.providerType,
      name: row.name,
      isActive: row.isActive,
      enabled: row.isActive,
      configured: Boolean(row.credentialsEncrypted),
      healthStatus: row.healthStatus,
      externalValidationStatus,
      validationStatus: externalValidationStatus,
      lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
      validationError: null,
      config: row.config,
      credentialKeyVersion: row.credentialKeyVersion,
      credentialsUpdatedAt: (credentialsUpdatedAt ?? row.updatedAt).toISOString(),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
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
      actorUserId: actorId,
      actorType: 'user',
      action,
      resourceType: 'ai_provider_connection',
      resourceId,
      metadata: redactObject(metadata) as Record<string, unknown>,
    });
  }

  private async assertTenantAccess(actor: AuthenticatedUser, tenantId: string) {
    const isMember = actor.tenantMemberships.some((m) => m.tenantId === tenantId);
    const isPlatform = actor.platformRoles.includes('platform_super_admin');
    if (!isMember && !isPlatform) throw tenantAccessDenied();
  }
}

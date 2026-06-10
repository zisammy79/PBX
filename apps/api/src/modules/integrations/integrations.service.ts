import { Inject, Injectable } from '@nestjs/common';
import { notFound, validationError } from '@pbx/contracts';
import { encryptSecret, redactObject } from '@pbx/shared';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import {
  integrationAssignments,
  integrationAuditEvents,
  integrationConnections,
  integrationCredentialVersions,
  integrationValidations,
  withBypassRls,
} from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import type {
  CreateIntegration,
  CreateIntegrationAssignment,
  ReplaceIntegrationCredential,
  UpdateIntegration,
} from '@pbx/contracts';
import { IntegrationValidatorService } from './integration-validator.service.js';
import { validateSipConfiguration, validateSipNetwork } from './sip-network-validator.js';

const SECRET_KEYS = new Set([
  'apiKey',
  'api_key',
  'secretKey',
  'password',
  'webhookSecret',
  'secret',
  'token',
]);

@Injectable()
export class IntegrationsService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
    private readonly validator: IntegrationValidatorService,
  ) {}

  async list(actor: AuthenticatedUser, filters?: { integrationType?: string }) {
    return withBypassRls(this.database.db, async (db) => {
      const conditions = [eq(integrationConnections.scopeType, 'platform')];
      if (filters?.integrationType) {
        conditions.push(eq(integrationConnections.integrationType, filters.integrationType));
      }
      const rows = await db
        .select()
        .from(integrationConnections)
        .where(and(...conditions))
        .orderBy(desc(integrationConnections.updatedAt));

      const enriched = [];
      for (const row of rows) {
        const [assignmentCount] = await db
          .select({ value: count() })
          .from(integrationAssignments)
          .where(eq(integrationAssignments.connectionId, row.id));
        enriched.push(this.serialize(row, Number(assignmentCount?.value ?? 0)));
      }
      return enriched;
    });
  }

  async get(actor: AuthenticatedUser, id: string) {
    return withBypassRls(this.database.db, async (db) => {
      const [row] = await db.select().from(integrationConnections).where(eq(integrationConnections.id, id)).limit(1);
      if (!row) throw notFound('Integration');
      const [assignmentCount] = await db
        .select({ value: count() })
        .from(integrationAssignments)
        .where(eq(integrationAssignments.connectionId, id));
      return this.serialize(row, Number(assignmentCount?.value ?? 0));
    });
  }

  async create(actor: AuthenticatedUser, input: CreateIntegration) {
    if (input.scopeType !== 'platform') {
      throw validationError({ scopeType: 'Platform owner UI manages platform-scoped integrations only' });
    }
    this.validateCredentialPayload(input.integrationType, input.provider, input.environment, input.credentials);

    const encrypted = input.credentials
      ? encryptSecret(JSON.stringify(input.credentials), this.config.encryptionMasterKey)
      : null;

    return withBypassRls(this.database.db, async (db) => {
      const now = new Date();
      const validationStatus = encrypted ? 'CONFIGURED_NOT_TESTED' : 'NOT_CONFIGURED';
      const [row] = await db
        .insert(integrationConnections)
        .values({
          integrationType: input.integrationType,
          provider: input.provider,
          scopeType: 'platform',
          environment: input.environment ?? 'default',
          displayName: input.displayName,
          enabled: input.enabled ?? true,
          isDefault: input.isDefault ?? false,
          config: input.config ?? {},
          encryptedPayload: encrypted,
          validationStatus,
          createdBy: actor.id,
          updatedAt: now,
        })
        .returning();

      if (encrypted && row) {
        await db.insert(integrationCredentialVersions).values({
          connectionId: row.id,
          version: 1,
          encryptedPayload: encrypted,
          isActive: true,
          createdBy: actor.id,
        });
      }

      await this.audit(db, row!.id, null, actor.id, 'integration.created', {
        integrationType: input.integrationType,
        provider: input.provider,
        environment: input.environment,
      });

      return this.serialize(row!, 0);
    });
  }

  async update(actor: AuthenticatedUser, id: string, input: UpdateIntegration) {
    return withBypassRls(this.database.db, async (db) => {
      const [existing] = await db.select().from(integrationConnections).where(eq(integrationConnections.id, id)).limit(1);
      if (!existing) throw notFound('Integration');

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.displayName !== undefined) patch.displayName = input.displayName;
      if (input.enabled !== undefined) {
        patch.enabled = input.enabled;
        patch.validationStatus = input.enabled ? existing.validationStatus : 'DISABLED';
      }
      if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
      if (input.config !== undefined) patch.config = input.config;

      if (input.credentials !== undefined) {
        if (Object.keys(input.credentials).length === 0) {
          // blank credentials on edit preserve existing secret
        } else {
          this.validateCredentialPayload(
            existing.integrationType,
            existing.provider,
            existing.environment,
            input.credentials,
          );
          patch.encryptedPayload = encryptSecret(
            JSON.stringify(input.credentials),
            this.config.encryptionMasterKey,
          );
          patch.validationStatus = 'CONFIGURED_NOT_TESTED';
          patch.credentialVersion = existing.credentialVersion + 1;
          patch.rotatedAt = new Date();
        }
      }

      const [row] = await db.update(integrationConnections).set(patch).where(eq(integrationConnections.id, id)).returning();

      if (input.credentials && Object.keys(input.credentials).length > 0 && row) {
        await db
          .update(integrationCredentialVersions)
          .set({ isActive: false })
          .where(eq(integrationCredentialVersions.connectionId, id));
        await db.insert(integrationCredentialVersions).values({
          connectionId: id,
          version: row.credentialVersion,
          encryptedPayload: row.encryptedPayload!,
          isActive: true,
          createdBy: actor.id,
        });
        await this.audit(db, id, null, actor.id, 'integration.credential_updated', {});
      } else {
        await this.audit(db, id, null, actor.id, 'integration.updated', { fields: Object.keys(input) });
      }

      return this.get(actor, id);
    });
  }

  async replaceCredential(actor: AuthenticatedUser, id: string, input: ReplaceIntegrationCredential) {
    return this.update(actor, id, { credentials: input.credentials });
  }

  async rotate(actor: AuthenticatedUser, id: string, credentials: Record<string, unknown>) {
    await this.auditOnly(actor, id, 'integration.rotate_requested', {});
    return this.replaceCredential(actor, id, { credentials, confirmReplace: true });
  }

  async enable(actor: AuthenticatedUser, id: string) {
    return this.update(actor, id, { enabled: true });
  }

  async disable(actor: AuthenticatedUser, id: string) {
    return this.update(actor, id, { enabled: false });
  }

  async validateConfiguration(actor: AuthenticatedUser, id: string) {
    return this.validateWithLevel(actor, id, 'CONFIGURATION');
  }

  async validateNetwork(actor: AuthenticatedUser, id: string) {
    return this.validateWithLevel(actor, id, 'NETWORK');
  }

  private async validateWithLevel(actor: AuthenticatedUser, id: string, level: 'CONFIGURATION' | 'NETWORK' | 'DEFAULT') {
    return withBypassRls(this.database.db, async (db) => {
      const [row] = await db.select().from(integrationConnections).where(eq(integrationConnections.id, id)).limit(1);
      if (!row) throw notFound('Integration');
      if (!row.encryptedPayload) {
        throw validationError({ credentials: 'Integration has no configured credential' });
      }

      const secrets = this.validator.decryptPayload(row.encryptedPayload, this.config);
      const config = (row.config ?? {}) as Record<string, unknown>;
      const now = new Date();
      const stripeSecrets = {
        ...secrets,
        ...(config.publishableKey ? { publishableKey: String(config.publishableKey) } : {}),
      };
      let result;

      switch (row.integrationType) {
        case 'stripe':
          this.validator.rejectLiveStripeInTest(row.environment, stripeSecrets);
          result = this.validator.validateStripeSecrets(stripeSecrets, row.environment);
          break;
        case 'ai':
          result = await this.validator.validateOpenAiConnection(secrets, config);
          break;
        case 'sip_carrier':
          if (level === 'NETWORK') {
            const network = await validateSipNetwork(secrets, config);
            result = {
              status: network.status === 'REGISTERED' || network.status === 'OPTIONS_REACHABLE' ? 'VALID' : 'INVALID',
              sanitizedError: network.sanitizedError,
            };
            await db.insert(integrationValidations).values({
              connectionId: id,
              validationLevel: 'network',
              status: network.status,
              sanitizedResult: {
                responseCode: network.responseCode,
                registrationState: network.registrationState,
              },
              roundTripMs: network.roundTripMs,
              credentialVersion: row.credentialVersion,
            });
            await this.audit(db, id, null, actor.id, 'integration.network_validated', {
              status: network.status,
              roundTripMs: network.roundTripMs,
            });
            return {
              id,
              validationLevel: 'NETWORK',
              validationStatus: network.status,
              sanitizedError: network.sanitizedError ?? null,
              responseCode: network.responseCode ?? null,
              roundTripMs: network.roundTripMs ?? null,
              credentialVersion: row.credentialVersion,
              lastValidatedAt: now.toISOString(),
            };
          }
          if (level === 'CONFIGURATION') {
            const configResult = validateSipConfiguration(secrets, config);
            result = {
              status: configResult.status === 'CONFIGURATION_VALID' ? 'VALID' : 'INVALID',
              sanitizedError: configResult.sanitizedError,
            };
            await db.insert(integrationValidations).values({
              connectionId: id,
              validationLevel: 'configuration',
              status: configResult.status,
              sanitizedResult: {},
              credentialVersion: row.credentialVersion,
            });
            await this.audit(db, id, null, actor.id, 'integration.configuration_validated', {
              status: configResult.status,
            });
            return {
              id,
              validationLevel: 'CONFIGURATION',
              validationStatus: configResult.status,
              sanitizedError: configResult.sanitizedError ?? null,
              credentialVersion: row.credentialVersion,
              lastValidatedAt: now.toISOString(),
            };
          }
          result = this.validator.validateSipConfig(secrets, config);
          break;
        default:
          result = { status: 'CONFIGURED_NOT_TESTED' as const };
      }

      await db
        .update(integrationConnections)
        .set({
          validationStatus: result.status,
          sanitizedValidationError: result.sanitizedError ?? null,
          lastValidatedAt: now,
          updatedAt: now,
        })
        .where(eq(integrationConnections.id, id));

      await this.audit(db, id, null, actor.id, 'integration.validated', {
        status: result.status,
        sanitizedError: result.sanitizedError ?? null,
      });

      return {
        id,
        validationStatus: result.status,
        sanitizedError: result.sanitizedError ?? null,
        lastValidatedAt: now.toISOString(),
        connected: result.status === 'VALID',
      };
    });
  }

  async listAssignments(actor: AuthenticatedUser, id: string) {
    return withBypassRls(this.database.db, async (db) => {
      return db
        .select()
        .from(integrationAssignments)
        .where(eq(integrationAssignments.connectionId, id));
    });
  }

  async assign(actor: AuthenticatedUser, id: string, input: CreateIntegrationAssignment) {
    return withBypassRls(this.database.db, async (db) => {
      const [row] = await db
        .insert(integrationAssignments)
        .values({
          connectionId: id,
          tenantId: input.tenantId,
          enabled: input.enabled ?? true,
        })
        .onConflictDoUpdate({
          target: [integrationAssignments.connectionId, integrationAssignments.tenantId],
          set: { enabled: input.enabled ?? true },
        })
        .returning();

      await this.audit(db, id, input.tenantId, actor.id, 'integration.assigned', { tenantId: input.tenantId });
      return row;
    });
  }

  async removeAssignment(actor: AuthenticatedUser, id: string, assignmentId: string) {
    return withBypassRls(this.database.db, async (db) => {
      const [row] = await db
        .select()
        .from(integrationAssignments)
        .where(and(eq(integrationAssignments.id, assignmentId), eq(integrationAssignments.connectionId, id)))
        .limit(1);
      if (!row) throw notFound('Assignment');
      await db.delete(integrationAssignments).where(eq(integrationAssignments.id, assignmentId));
      await this.audit(db, id, row.tenantId, actor.id, 'integration.assignment_removed', { assignmentId });
      return { removed: true, assignmentId };
    });
  }

  async auditHistory(actor: AuthenticatedUser, id: string) {
    return withBypassRls(this.database.db, async (db) => {
      return db
        .select()
        .from(integrationAuditEvents)
        .where(eq(integrationAuditEvents.connectionId, id))
        .orderBy(desc(integrationAuditEvents.createdAt))
        .limit(100);
    });
  }

  async auditAll(actor: AuthenticatedUser) {
    return withBypassRls(this.database.db, async (db) => {
      return db
        .select()
        .from(integrationAuditEvents)
        .orderBy(desc(integrationAuditEvents.createdAt))
        .limit(200);
    });
  }

  private serialize(row: typeof integrationConnections.$inferSelect, tenantCount: number) {
    return {
      id: row.id,
      integrationType: row.integrationType,
      provider: row.provider,
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      environment: row.environment,
      displayName: row.displayName,
      enabled: row.enabled,
      isDefault: row.isDefault,
      config: redactObject((row.config ?? {}) as Record<string, unknown>),
      credentialConfigured: Boolean(row.encryptedPayload),
      credentialVersion: row.credentialVersion,
      validationStatus: row.enabled ? row.validationStatus : 'DISABLED',
      lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
      sanitizedValidationError: row.sanitizedValidationError,
      rotatedAt: row.rotatedAt?.toISOString() ?? null,
      tenantAssignmentCount: tenantCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private validateCredentialPayload(
    integrationType: string,
    provider: string,
    environment: string,
    credentials?: Record<string, unknown>,
  ) {
    if (!credentials) return;
    const asStrings: Record<string, string> = {};
    for (const [k, v] of Object.entries(credentials)) {
      if (typeof v === 'string') asStrings[k] = v;
    }
    if (integrationType === 'stripe') {
      this.validator.rejectLiveStripeInTest(environment, asStrings);
      const result = this.validator.validateStripeSecrets(asStrings, environment);
      if (result.status === 'INVALID') {
        throw validationError({ credentials: result.sanitizedError });
      }
    }
    if (integrationType === 'ai' && provider === 'openai') {
      if (!asStrings.apiKey?.trim()) {
        throw validationError({ credentials: 'apiKey is required' });
      }
    }
    if (integrationType === 'sip_carrier' && !asStrings.password && !asStrings.username) {
      throw validationError({ credentials: 'SIP credentials required' });
    }
    for (const key of Object.keys(credentials)) {
      if (SECRET_KEYS.has(key) && typeof credentials[key] === 'string' && !String(credentials[key]).trim()) {
        throw validationError({ credentials: `${key} cannot be empty` });
      }
    }
  }

  private async audit(
    db: Parameters<Parameters<typeof withBypassRls>[1]>[0],
    connectionId: string,
    tenantId: string | null,
    actorId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    await db.insert(integrationAuditEvents).values({
      connectionId,
      tenantId: tenantId ?? undefined,
      action,
      actorUserId: actorId,
      metadata: redactObject(metadata) as Record<string, unknown>,
    });
  }

  private async auditOnly(actor: AuthenticatedUser, connectionId: string, action: string, metadata: Record<string, unknown>) {
    return withBypassRls(this.database.db, async (db) => {
      await this.audit(db, connectionId, null, actor.id, action, metadata);
    });
  }
}

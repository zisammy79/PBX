import { Injectable } from '@nestjs/common';
import { validationError } from '@pbx/contracts';
import { decryptSecret } from '@pbx/shared';
import { and, desc, eq, or } from 'drizzle-orm';
import {
  aiProviderConnections,
  integrationAssignments,
  integrationConnections,
  sipTrunks,
  withBypassRls,
} from '@pbx/database';
import type { AppConfig } from '../../config.js';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import { Inject } from '@nestjs/common';
import { resolveEnvironmentFallback } from './credential-env-fallback.js';

export type CredentialSource =
  | 'TENANT_ASSIGNMENT'
  | 'TENANT_UI'
  | 'TENANT_LEGACY_AI'
  | 'TENANT_LEGACY_SIP'
  | 'PLATFORM_UI'
  | 'PLATFORM_DEFAULT'
  | 'ENVIRONMENT_FALLBACK';

export type ResolveCredentialInput = {
  integrationType: 'ai' | 'sip_carrier' | 'stripe';
  provider: string;
  tenantId?: string;
  environment?: string;
};

export type ResolvedCredential = {
  source: CredentialSource;
  connectionId?: string;
  credentialVersion?: number;
  provider: string;
  integrationType: string;
  environment: string;
  config: Record<string, unknown>;
  secrets: Record<string, string>;
};

@Injectable()
export class CredentialResolverService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async resolveMetadata(input: {
    integrationType: 'ai' | 'sip_carrier' | 'stripe';
    provider: string;
    tenantId?: string;
    environment?: string;
  }) {
    const status = await this.resolveStatus(input);
    if (!status.configured) {
      throw validationError({ integration: 'CREDENTIAL_NOT_CONFIGURED' });
    }
    return {
      credentialSource: status.source,
      integrationId: status.connectionId,
      credentialVersion: status.credentialVersion,
      provider: input.provider,
      environment: input.environment ?? (input.integrationType === 'stripe' ? 'test' : 'default'),
    };
  }

  async resolveStatus(input: ResolveCredentialInput): Promise<{
    configured: boolean;
    source?: CredentialSource;
    validationStatus?: string;
    connectionId?: string;
    credentialVersion?: number;
  }> {
    try {
      const resolved = await this.resolve(input);
      return {
        configured: true,
        source: resolved.source,
        ...(resolved.connectionId ? { connectionId: resolved.connectionId } : {}),
        ...(resolved.credentialVersion != null ? { credentialVersion: resolved.credentialVersion } : {}),
      };
    } catch {
      return { configured: false };
    }
  }

  async resolve(input: ResolveCredentialInput): Promise<ResolvedCredential> {
    const env = input.environment ?? (input.integrationType === 'stripe' ? 'test' : 'default');
    const tenantId = input.tenantId;

    if (tenantId) {
      const disabled = await this.resolveDisabledAssignment(tenantId, input.integrationType, input.provider, env);
      if (disabled) {
        throw validationError({ integration: 'CREDENTIAL_DISABLED' });
      }

      const assigned = await this.resolveTenantAssignment(tenantId, input.integrationType, input.provider, env);
      if (assigned) return assigned;

      const tenantOwned = await this.resolveTenantIntegration(tenantId, input.integrationType, input.provider, env);
      if (tenantOwned) return tenantOwned;

      if (input.integrationType === 'ai') {
        const legacy = await this.resolveLegacyAi(tenantId, input.provider);
        if (legacy) return legacy;
      }
      if (input.integrationType === 'sip_carrier') {
        const legacySip = await this.resolveLegacySip(tenantId);
        if (legacySip) return legacySip;
      }
    }

    const platform = await this.resolvePlatform(input.integrationType, input.provider, env, tenantId);
    if (platform) return platform;

    const envFallback = resolveEnvironmentFallback(input.integrationType, input.provider, env);
    if (envFallback) return envFallback;

    throw validationError({
      integration: `No credential configured for ${input.integrationType}/${input.provider}`,
    });
  }

  private async resolveDisabledAssignment(
    tenantId: string,
    integrationType: string,
    provider: string,
    environment: string,
  ): Promise<boolean> {
    return withBypassRls(this.database.db, async (db) => {
      const rows = await db
        .select({ conn: integrationConnections, assignment: integrationAssignments })
        .from(integrationAssignments)
        .innerJoin(integrationConnections, eq(integrationAssignments.connectionId, integrationConnections.id))
        .where(
          and(
            eq(integrationAssignments.tenantId, tenantId),
            eq(integrationConnections.integrationType, integrationType),
            eq(integrationConnections.provider, provider),
            or(
              eq(integrationConnections.environment, environment),
              eq(integrationConnections.environment, 'default'),
            ),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return false;
      return !row.assignment.enabled || !row.conn.enabled;
    });
  }

  private async resolveTenantAssignment(
    tenantId: string,
    integrationType: string,
    provider: string,
    environment: string,
  ): Promise<ResolvedCredential | null> {
    return withBypassRls(this.database.db, async (db) => {
      const rows = await db
        .select({ conn: integrationConnections, assignment: integrationAssignments })
        .from(integrationAssignments)
        .innerJoin(integrationConnections, eq(integrationAssignments.connectionId, integrationConnections.id))
        .where(
          and(
            eq(integrationAssignments.tenantId, tenantId),
            eq(integrationAssignments.enabled, true),
            eq(integrationConnections.enabled, true),
            eq(integrationConnections.integrationType, integrationType),
            eq(integrationConnections.provider, provider),
            or(
              eq(integrationConnections.environment, environment),
              eq(integrationConnections.environment, 'default'),
            ),
          ),
        )
        .orderBy(desc(integrationConnections.updatedAt))
        .limit(1);

      const row = rows[0];
      if (!row?.conn.encryptedPayload) return null;
      return this.toResolved(row.conn, 'TENANT_ASSIGNMENT');
    });
  }

  private async resolveTenantIntegration(
    tenantId: string,
    integrationType: string,
    provider: string,
    environment: string,
  ): Promise<ResolvedCredential | null> {
    return withBypassRls(this.database.db, async (db) => {
      const [row] = await db
        .select()
        .from(integrationConnections)
        .where(
          and(
            eq(integrationConnections.scopeType, 'tenant'),
            eq(integrationConnections.scopeId, tenantId),
            eq(integrationConnections.enabled, true),
            eq(integrationConnections.integrationType, integrationType),
            eq(integrationConnections.provider, provider),
            or(
              eq(integrationConnections.environment, environment),
              eq(integrationConnections.environment, 'default'),
            ),
          ),
        )
        .orderBy(desc(integrationConnections.updatedAt))
        .limit(1);
      if (!row?.encryptedPayload) return null;
      return this.toResolved(row, 'TENANT_UI');
    });
  }

  private async resolveLegacyAi(tenantId: string, provider: string): Promise<ResolvedCredential | null> {
    return withBypassRls(this.database.db, async (db) => {
      const [row] = await db
        .select()
        .from(aiProviderConnections)
        .where(
          and(
            eq(aiProviderConnections.tenantId, tenantId),
            eq(aiProviderConnections.isActive, true),
            eq(aiProviderConnections.providerType, provider),
          ),
        )
        .limit(1);
      if (!row) return null;
      const secrets = JSON.parse(
        decryptSecret(row.credentialsEncrypted, this.config.encryptionMasterKey),
      ) as Record<string, string>;
      return {
        source: 'TENANT_LEGACY_AI',
        connectionId: row.id,
        provider: row.providerType,
        integrationType: 'ai',
        environment: 'default',
        config: (row.config ?? {}) as Record<string, unknown>,
        secrets,
      };
    });
  }

  private async resolveLegacySip(tenantId: string): Promise<ResolvedCredential | null> {
    return withBypassRls(this.database.db, async (db) => {
      const [row] = await db
        .select()
        .from(sipTrunks)
        .where(and(eq(sipTrunks.tenantId, tenantId), eq(sipTrunks.isActive, true)))
        .orderBy(desc(sipTrunks.updatedAt))
        .limit(1);
      if (!row?.credentialsEncrypted) return null;
      const secrets = JSON.parse(
        decryptSecret(row.credentialsEncrypted, this.config.encryptionMasterKey),
      ) as Record<string, string>;
      return {
        source: 'TENANT_LEGACY_SIP',
        connectionId: row.id,
        provider: row.providerAdapter,
        integrationType: 'sip_carrier',
        environment: 'default',
        config: (row.config ?? {}) as Record<string, unknown>,
        secrets,
      };
    });
  }

  private async resolvePlatform(
    integrationType: string,
    provider: string,
    environment: string,
    tenantId?: string,
  ): Promise<ResolvedCredential | null> {
    return withBypassRls(this.database.db, async (db) => {
      const [row] = await db
        .select()
        .from(integrationConnections)
        .where(
          and(
            eq(integrationConnections.scopeType, 'platform'),
            eq(integrationConnections.enabled, true),
            eq(integrationConnections.integrationType, integrationType),
            eq(integrationConnections.provider, provider),
            or(
              eq(integrationConnections.environment, environment),
              eq(integrationConnections.environment, 'default'),
            ),
          ),
        )
        .orderBy(desc(integrationConnections.isDefault), desc(integrationConnections.updatedAt))
        .limit(1);
      if (!row?.encryptedPayload) return null;

      if (tenantId && !row.isDefault) {
        const [assignment] = await db
          .select()
          .from(integrationAssignments)
          .where(
            and(
              eq(integrationAssignments.connectionId, row.id),
              eq(integrationAssignments.tenantId, tenantId),
              eq(integrationAssignments.enabled, true),
            ),
          )
          .limit(1);
        if (!assignment) return null;
      }

      return this.toResolved(row, row.isDefault ? 'PLATFORM_DEFAULT' : 'PLATFORM_UI');
    });
  }

  private toResolved(
    row: typeof integrationConnections.$inferSelect,
    source: CredentialSource,
  ): ResolvedCredential {
    const secrets = JSON.parse(
      decryptSecret(row.encryptedPayload!, this.config.encryptionMasterKey),
    ) as Record<string, string>;
    return {
      source,
      connectionId: row.id,
      credentialVersion: row.credentialVersion,
      provider: row.provider,
      integrationType: row.integrationType,
      environment: row.environment,
      config: (row.config ?? {}) as Record<string, unknown>,
      secrets,
    };
  }
}

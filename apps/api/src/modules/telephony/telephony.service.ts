import { Inject, Injectable } from '@nestjs/common';
import { tenantAccessDenied, validationError } from '@pbx/contracts';
import { decryptSecret } from '@pbx/shared';
import { and, eq } from 'drizzle-orm';
import {
  auditEvents,
  aiAgents,
  extensions,
  sipCredentials,
  tenants,
  withBypassRls,
  withTenantContext,
} from '@pbx/database';
import {
  activateStagingConfig,
  generateTelephonyConfig,
  redactForAudit,
  redactGeneratedConfig,
  reloadAsterisk,
  validateGeneratedConfig,
  writeStagingConfig,
  type GeneratedTelephonyConfig,
  type TelephonyExtensionRecord,
  type TelephonyTenantRecord,
  type TelephonyAiAgentRecord,
} from '@pbx/telephony-config';
import { resolveRepoRoot } from '../../common/repo-root.js';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';

@Injectable()
export class TelephonyService {
  private readonly repoRoot: string;

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {
    this.repoRoot = resolveRepoRoot(this.config.repoRoot);
  }

  async validateConfiguration(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantAccess(actor, tenantId);
    const generated = await this.buildConfigForTenant(tenantId);
    const validation = validateGeneratedConfig(generated, { requireExtensions: true });
    await this.recordAudit(actor, tenantId, 'telephony.configuration.validate', {
      version: generated.version,
      valid: validation.valid,
      errors: validation.errors,
    });
    return {
      valid: validation.valid,
      errors: validation.errors,
      version: generated.version,
      extensionCount: generated.manifest.extensionCount,
      preview: redactGeneratedConfig(generated),
    };
  }

  async activateConfiguration(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantAccess(actor, tenantId);
    if (!this.config.telephonyEnabled) {
      throw validationError({ telephony: 'Telephony is not enabled' });
    }

    const generated = await this.buildGlobalConfig();
    const validation = validateGeneratedConfig(generated, { requireExtensions: true });
    if (!validation.valid) {
      throw validationError({ configuration: validation.errors.join('; ') });
    }

    await writeStagingConfig(this.repoRoot, generated);
    const result = await activateStagingConfig(this.repoRoot);
    if (!result.activated) {
      throw validationError({ activation: result.error ?? 'Activation failed' });
    }

    if (this.config.asteriskAriUrl && this.config.asteriskAriPassword) {
      await reloadAsterisk({
        ariUrl: this.config.asteriskAriUrl,
        ariUsername: this.config.asteriskAriUsername,
        ariPassword: this.config.asteriskAriPassword,
      });
    }

    await this.recordAudit(actor, tenantId, 'telephony.configuration.activate', {
      version: result.version,
      previousVersion: result.previousVersion,
      tenantIds: generated.tenantIds,
    });

    return {
      activated: true,
      version: result.version,
      previousVersion: result.previousVersion ?? null,
    };
  }

  async buildConfigForTenant(tenantId: string): Promise<GeneratedTelephonyConfig> {
    const { tenants: tenantRows, extensions: extensionRows, aiAgents: aiAgentRows } =
      await this.loadTelephonyRecords(tenantId);
    return generateTelephonyConfig(tenantRows, extensionRows, aiAgentRows, `tenant-${tenantId}-${Date.now()}`);
  }

  async buildGlobalConfig(): Promise<GeneratedTelephonyConfig> {
    const { tenants: tenantRows, extensions: extensionRows, aiAgents: aiAgentRows } = await this.loadTelephonyRecords();
    return generateTelephonyConfig(tenantRows, extensionRows, aiAgentRows, `global-${Date.now()}`);
  }

  private async loadTelephonyRecords(tenantId?: string) {
    return withBypassRls(this.database.db, async (db) => {
      const tenantQuery = db.select().from(tenants);
      const tenantRows = tenantId
        ? await tenantQuery.where(eq(tenants.id, tenantId))
        : await tenantQuery.where(eq(tenants.status, 'active'));

      const extensionQuery = db
        .select({
          extension: extensions,
          credential: sipCredentials,
          tenant: tenants,
        })
        .from(extensions)
        .innerJoin(tenants, eq(extensions.tenantId, tenants.id))
        .innerJoin(sipCredentials, eq(sipCredentials.extensionId, extensions.id));

      const extensionRows = tenantId
        ? await extensionQuery.where(and(eq(extensions.tenantId, tenantId), eq(extensions.status, 'active')))
        : await extensionQuery.where(eq(extensions.status, 'active'));

      const aiQuery = db
        .select({ agent: aiAgents, tenant: tenants })
        .from(aiAgents)
        .innerJoin(tenants, eq(aiAgents.tenantId, tenants.id));
      const aiRows = tenantId
        ? await aiQuery.where(and(eq(aiAgents.tenantId, tenantId), eq(aiAgents.isActive, true)))
        : await aiQuery.where(eq(aiAgents.isActive, true));

      const tenantRecords: TelephonyTenantRecord[] = tenantRows.map((t) => ({
        tenantId: t.id,
        slug: t.slug,
        asteriskContext: t.asteriskContext,
        status: t.status,
      }));

      const extRecords: TelephonyExtensionRecord[] = [];
      for (const row of extensionRows) {
        try {
          extRecords.push({
            tenantId: row.extension.tenantId,
            tenantSlug: row.tenant.slug,
            asteriskContext: row.tenant.asteriskContext,
            extensionNumber: row.extension.extensionNumber,
            displayName: row.extension.displayName,
            asteriskEndpointId: row.extension.asteriskEndpointId,
            sipUsername: row.credential.username,
            sipSecret: decryptSecret(row.credential.secretEncrypted, this.config.encryptionMasterKey),
            status: row.extension.status as 'active' | 'disabled',
          });
        } catch {
          // Skip credentials encrypted with a different key or corrupted rows
        }
      }

      const aiAgentRows: TelephonyAiAgentRecord[] = aiRows
        .filter((r) => r.agent.routeNumber && r.tenant.status === 'active')
        .map((r) => ({
          tenantId: r.agent.tenantId,
          tenantSlug: r.tenant.slug,
          asteriskContext: r.tenant.asteriskContext,
          routeNumber: r.agent.routeNumber!,
          agentId: r.agent.id,
          agentName: r.agent.name,
          status: r.agent.isActive ? 'active' : 'disabled',
        }));

      return { tenants: tenantRecords, extensions: extRecords, aiAgents: aiAgentRows };
    });
  }

  private async recordAudit(
    actor: AuthenticatedUser,
    tenantId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    await withTenantContext(this.database.db, tenantId, async (db) => {
      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action,
        resourceType: 'telephony_configuration',
        metadata: redactForAudit(metadata) as Record<string, unknown>,
      });
    });
  }

  private async assertTenantAccess(actor: AuthenticatedUser, tenantId: string) {
    const isMember = actor.tenantMemberships.some((m) => m.tenantId === tenantId);
    const isPlatform = actor.platformRoles.includes('platform_super_admin');
    if (!isMember && !isPlatform) {
      throw tenantAccessDenied();
    }
  }
}

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
  isSipUsernameInActiveConfig,
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

export type ExtensionProvisioningStatus =
  | 'pending'
  | 'provisioning'
  | 'ready'
  | 'failed'
  | 'deleting'
  | 'deleted';

export interface LoadTelephonyRecordsResult {
  tenants: TelephonyTenantRecord[];
  extensions: TelephonyExtensionRecord[];
  aiAgents: TelephonyAiAgentRecord[];
  skippedCredentialUsernames: string[];
}

export interface ProvisionGlobalResult {
  activated: boolean;
  version: string;
  previousVersion?: string | null;
  skippedCredentialUsernames: string[];
}

export interface ExtensionProvisioningState {
  status: ExtensionProvisioningStatus;
  reason?: string;
  runtimePresent: boolean;
}

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
    const result = await this.provisionGlobalConfiguration(actor, tenantId);
    return {
      activated: result.activated,
      version: result.version,
      previousVersion: result.previousVersion ?? null,
      skippedCredentialUsernames: result.skippedCredentialUsernames,
    };
  }

  async reconcileConfiguration(actor: AuthenticatedUser, tenantId: string) {
    return this.provisionGlobalConfiguration(actor, tenantId);
  }

  async provisionGlobalConfiguration(
    actor: AuthenticatedUser,
    tenantId: string,
  ): Promise<ProvisionGlobalResult> {
    await this.assertTenantAccess(actor, tenantId);
    if (!this.config.telephonyEnabled) {
      throw validationError({ telephony: 'Telephony is not enabled' });
    }

    const loaded = await this.loadTelephonyRecords();
    const generated = generateTelephonyConfig(
      loaded.tenants,
      loaded.extensions,
      loaded.aiAgents,
      `global-${Date.now()}`,
    );
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
      skippedCredentialCount: loaded.skippedCredentialUsernames.length,
    });

    if (loaded.skippedCredentialUsernames.length > 0) {
      await this.recordAudit(actor, tenantId, 'telephony.configuration.skipped_credentials', {
        usernames: loaded.skippedCredentialUsernames,
      });
    }

    return {
      activated: true,
      version: result.version,
      previousVersion: result.previousVersion ?? null,
      skippedCredentialUsernames: loaded.skippedCredentialUsernames,
    };
  }

  async getExtensionProvisioningState(
    tenantId: string,
    extensionId: string,
  ): Promise<ExtensionProvisioningState> {
    const row = await this.loadExtensionRecord(tenantId, extensionId);
    if (!row) {
      return { status: 'failed', reason: 'extension_not_found', runtimePresent: false };
    }

    if (row.extension.status === 'disabled') {
      const runtimePresent = await isSipUsernameInActiveConfig(
        this.repoRoot,
        row.credential.username,
      );
      return {
        status: runtimePresent ? 'failed' : 'deleted',
        ...(runtimePresent ? { reason: 'still_provisioned' } : {}),
        runtimePresent,
      };
    }

    try {
      decryptSecret(row.credential.secretEncrypted, this.config.encryptionMasterKey);
    } catch {
      return {
        status: 'failed',
        reason: 'credential_unavailable',
        runtimePresent: false,
      };
    }

    const runtimePresent = await isSipUsernameInActiveConfig(this.repoRoot, row.credential.username);
    if (runtimePresent) {
      return { status: 'ready', runtimePresent: true };
    }

    if (!this.config.telephonyEnabled) {
      return { status: 'pending', reason: 'telephony_disabled', runtimePresent: false };
    }

    return { status: 'failed', reason: 'not_provisioned', runtimePresent: false };
  }

  async verifyExtensionRuntime(
    tenantId: string,
    extensionId: string,
  ): Promise<{ ready: boolean; sipUsername: string; reason?: string }> {
    const row = await this.loadExtensionRecord(tenantId, extensionId);
    if (!row) {
      return { ready: false, sipUsername: '', reason: 'extension_not_found' };
    }

    if (row.extension.status === 'disabled') {
      const runtimePresent = await isSipUsernameInActiveConfig(
        this.repoRoot,
        row.credential.username,
      );
      return {
        ready: !runtimePresent,
        sipUsername: row.credential.username,
        ...(runtimePresent ? { reason: 'still_provisioned' } : {}),
      };
    }

    try {
      decryptSecret(row.credential.secretEncrypted, this.config.encryptionMasterKey);
    } catch {
      return {
        ready: false,
        sipUsername: row.credential.username,
        reason: 'credential_unavailable',
      };
    }

    const runtimePresent = await isSipUsernameInActiveConfig(this.repoRoot, row.credential.username);
    return {
      ready: runtimePresent,
      sipUsername: row.credential.username,
      ...(runtimePresent ? {} : { reason: 'not_provisioned' }),
    };
  }

  async verifyExtensionRemovedFromRuntime(
    tenantId: string,
    extensionId: string,
  ): Promise<{ removed: boolean; sipUsername: string; reason?: string }> {
    const row = await this.loadExtensionRecord(tenantId, extensionId);
    if (!row) {
      return { removed: true, sipUsername: '', reason: 'extension_not_found' };
    }

    const runtimePresent = await isSipUsernameInActiveConfig(
      this.repoRoot,
      row.credential.username,
    );
    return {
      removed: !runtimePresent,
      sipUsername: row.credential.username,
      ...(runtimePresent ? { reason: 'still_provisioned' } : {}),
    };
  }

  async buildConfigForTenant(tenantId: string): Promise<GeneratedTelephonyConfig> {
    const loaded = await this.loadTelephonyRecords(tenantId);
    return generateTelephonyConfig(
      loaded.tenants,
      loaded.extensions,
      loaded.aiAgents,
      `tenant-${tenantId}-${Date.now()}`,
    );
  }

  async buildGlobalConfig(): Promise<GeneratedTelephonyConfig> {
    const loaded = await this.loadTelephonyRecords();
    return generateTelephonyConfig(
      loaded.tenants,
      loaded.extensions,
      loaded.aiAgents,
      `global-${Date.now()}`,
    );
  }

  async loadTelephonyRecords(tenantId?: string): Promise<LoadTelephonyRecordsResult> {
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
      const skippedCredentialUsernames: string[] = [];
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
          skippedCredentialUsernames.push(row.credential.username);
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

      return {
        tenants: tenantRecords,
        extensions: extRecords,
        aiAgents: aiAgentRows,
        skippedCredentialUsernames,
      };
    });
  }

  private async loadExtensionRecord(tenantId: string, extensionId: string) {
    return withBypassRls(this.database.db, async (db) => {
      const [row] = await db
        .select({
          extension: extensions,
          credential: sipCredentials,
        })
        .from(extensions)
        .innerJoin(sipCredentials, eq(sipCredentials.extensionId, extensions.id))
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.id, extensionId)))
        .limit(1);
      return row ?? null;
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

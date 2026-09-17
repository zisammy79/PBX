import { Inject, Injectable } from '@nestjs/common';
import { tenantAccessDenied, validationError } from '@pbx/contracts';
import { decryptSecret } from '@pbx/shared';
import { and, eq, inArray } from 'drizzle-orm';
import {
  auditEvents,
  aiAgents,
  blacklistEntries,
  businessSchedules,
  extensions,
  featureCodes,
  inboundRoutes,
  ivrOptions,
  ivrs,
  mediaFiles,
  mohClasses,
  outboundRoutes,
  queueMembers,
  queues,
  ringGroupMembers,
  ringGroups,
  sipCredentials,
  sipDevices,
  sipTrunkEndpoints,
  sipTrunks,
  tenants,
  withBypassRls,
  withTenantContext,
} from '@pbx/database';
import {
  activateStagingConfig,
  generateTelephonyConfig,
  generateTrunkConfig,
  isSipUsernameInActiveConfig,
  mergeTelephonyWithTrunks,
  mohClassAsteriskName,
  redactForAudit,
  redactGeneratedConfig,
  reloadAsterisk,
  resolveMohSyncHostRoot,
  syncMohMediaClasses,
  validateGeneratedConfig,
  writeStagingConfig,
  type GeneratedTelephonyConfig,
  type TelephonyCallflowRecords,
  type TelephonyExtensionRecord,
  type TelephonyTenantRecord,
  type TelephonyAiAgentRecord,
  type TelephonyInboundRouteRecord,
  type TelephonyOutboundRouteRecord,
  type TelephonyTrunkRecord,
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
  callflow: TelephonyCallflowRecords;
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
    const trunkLoaded = await this.loadGlobalTrunkRecords();
    const outboundTenantSlugs = new Set(trunkLoaded.outbound.map((route) => route.tenantSlug));
    const generated = mergeTelephonyWithTrunks(
      generateTelephonyConfig(
        loaded.tenants,
        loaded.extensions,
        loaded.aiAgents,
        `global-${Date.now()}`,
        outboundTenantSlugs,
        loaded.callflow,
      ),
      generateTrunkConfig(trunkLoaded.trunks, trunkLoaded.inbound, trunkLoaded.outbound),
      loaded.callflow.blacklist,
    );
    const validation = validateGeneratedConfig(generated, { requireExtensions: true });
    if (!validation.valid) {
      throw validationError({ configuration: validation.errors.join('; ') });
    }

    const mohSync = await syncMohMediaClasses({
      mediaSourceRoot: this.config.callflowMediaLocalRoot!,
      syncHostRoot: resolveMohSyncHostRoot(this.repoRoot, this.config.asteriskMohSyncRoot),
      mohClasses: loaded.callflow.mohClasses,
    });

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
      trunkCount: trunkLoaded.trunks.filter((t) => t.isActive).length,
      mohSyncedClasses: mohSync.synced.length,
      mohSkippedTracks: mohSync.skipped.length,
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
      undefined,
      loaded.callflow,
    );
  }

  async buildGlobalConfig(): Promise<GeneratedTelephonyConfig> {
    const loaded = await this.loadTelephonyRecords();
    return generateTelephonyConfig(
      loaded.tenants,
      loaded.extensions,
      loaded.aiAgents,
      `global-${Date.now()}`,
      undefined,
      loaded.callflow,
    );
  }

  async loadTelephonyRecords(tenantId?: string): Promise<LoadTelephonyRecordsResult> {
    return withBypassRls(this.database.db, async (db) => {
      const tenantQuery = db.select().from(tenants);
      const tenantRows = tenantId
        ? await tenantQuery.where(eq(tenants.id, tenantId))
        : await tenantQuery.where(eq(tenants.status, 'active'));

      const deviceRows = tenantId
        ? await db
            .select({
              device: sipDevices,
              credential: sipCredentials,
              extension: extensions,
              tenant: tenants,
            })
            .from(sipDevices)
            .innerJoin(sipCredentials, eq(sipDevices.sipCredentialId, sipCredentials.id))
            .innerJoin(extensions, eq(sipDevices.extensionId, extensions.id))
            .innerJoin(tenants, eq(sipDevices.tenantId, tenants.id))
            .where(
              and(
                eq(sipDevices.tenantId, tenantId),
                eq(extensions.status, 'active'),
                inArray(sipDevices.status, ['ready', 'provisioning']),
              ),
            )
        : await db
            .select({
              device: sipDevices,
              credential: sipCredentials,
              extension: extensions,
              tenant: tenants,
            })
            .from(sipDevices)
            .innerJoin(sipCredentials, eq(sipDevices.sipCredentialId, sipCredentials.id))
            .innerJoin(extensions, eq(sipDevices.extensionId, extensions.id))
            .innerJoin(tenants, eq(sipDevices.tenantId, tenants.id))
            .where(
              and(eq(extensions.status, 'active'), inArray(sipDevices.status, ['ready', 'provisioning'])),
            );

      const extRecords: TelephonyExtensionRecord[] = [];
      const skippedCredentialUsernames: string[] = [];

      if (deviceRows.length > 0) {
        for (const row of deviceRows) {
          try {
            extRecords.push({
              extensionId: row.extension.id,
              tenantId: row.extension.tenantId,
              tenantSlug: row.tenant.slug,
              asteriskContext: row.tenant.asteriskContext,
              extensionNumber: row.extension.extensionNumber,
              displayName: row.device.friendlyName || row.extension.displayName,
              asteriskEndpointId: row.device.asteriskEndpointId ?? row.extension.asteriskEndpointId,
              sipUsername: row.credential.username,
              sipSecret: decryptSecret(row.credential.secretEncrypted, this.config.encryptionMasterKey),
              status: row.extension.status as 'active' | 'disabled',
            });
          } catch {
            skippedCredentialUsernames.push(row.credential.username);
          }
        }
      } else {
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

        for (const row of extensionRows) {
          try {
            extRecords.push({
              extensionId: row.extension.id,
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
      }

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

      const callflow = await this.loadCallflowRecords(
        db,
        tenantRows.map((t) => t.id),
        extRecords,
      );

      return {
        tenants: tenantRecords,
        extensions: extRecords,
        aiAgents: aiAgentRows,
        callflow,
        skippedCredentialUsernames,
      };
    });
  }

  private async loadCallflowRecords(
    db: Parameters<Parameters<typeof withBypassRls>[1]>[0],
    tenantIds: string[],
    extensions: TelephonyExtensionRecord[],
  ): Promise<TelephonyCallflowRecords> {
    if (tenantIds.length === 0) {
      return {
        ivrs: [],
        schedules: [],
        queues: [],
        ringGroups: [],
        featureCodes: [],
        blacklist: [],
        mohClasses: [],
      };
    }

    const extensionById = new Map(extensions.map((ext) => [ext.extensionId, ext]));

    const ivrRows = await db.select().from(ivrs);
    const ivrOptionRows = await db.select().from(ivrOptions);
    const scheduleRows = await db.select().from(businessSchedules);
    const queueRows = await db.select().from(queues);
    const queueMemberRows = await db.select().from(queueMembers);
    const ringGroupRows = await db.select().from(ringGroups);
    const ringGroupMemberRows = await db.select().from(ringGroupMembers);
    const featureCodeRows = await db.select().from(featureCodes);
    const blacklistRows = await db.select().from(blacklistEntries);
    const mohClassRows = await db.select().from(mohClasses);
    const mediaFileRows = await db.select().from(mediaFiles);

    const tenantSlugById = new Map<string, { slug: string; asteriskContext: string }>();
    const tenantRows = await db.select().from(tenants);
    for (const tenant of tenantRows) {
      tenantSlugById.set(tenant.id, { slug: tenant.slug, asteriskContext: tenant.asteriskContext });
    }

    const scopedTenantIds = new Set(tenantIds);
    const mediaById = new Map(mediaFileRows.map((row) => [row.id, row]));
    const mohClassNameById = new Map<string, string>();

    for (const row of mohClassRows.filter((item) => scopedTenantIds.has(item.tenantId))) {
      const tenantMeta = tenantSlugById.get(row.tenantId);
      if (!tenantMeta) continue;
      mohClassNameById.set(row.id, mohClassAsteriskName(tenantMeta.slug, row.id));
    }

    return {
      ivrs: ivrRows
        .filter((row) => scopedTenantIds.has(row.tenantId))
        .map((row) => {
          const tenantMeta = tenantSlugById.get(row.tenantId);
          if (!tenantMeta) return null;
          return {
            tenantId: row.tenantId,
            tenantSlug: tenantMeta.slug,
            asteriskContext: tenantMeta.asteriskContext,
            ivrId: row.id,
            name: row.name,
            greetingAudioKey: row.greetingAudioKey,
            timeoutSeconds: row.timeoutSeconds,
            maxRetries: row.maxRetries,
            language: row.language,
            options: ivrOptionRows
              .filter((option) => option.ivrId === row.id)
              .map((option) => ({
                digit: option.digit,
                destinationType: option.destinationType,
                destinationId: option.destinationId,
              })),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
      schedules: scheduleRows
        .filter((row) => scopedTenantIds.has(row.tenantId))
        .map((row) => {
          const tenantMeta = tenantSlugById.get(row.tenantId);
          if (!tenantMeta) return null;
          return {
            tenantId: row.tenantId,
            tenantSlug: tenantMeta.slug,
            asteriskContext: tenantMeta.asteriskContext,
            scheduleId: row.id,
            name: row.name,
            timezone: row.timezone,
            scheduleType: row.scheduleType,
            rules: (row.rules ?? []) as unknown[],
            openDestinationType: row.openDestinationType,
            openDestinationId: row.openDestinationId,
            closedDestinationType: row.closedDestinationType,
            closedDestinationId: row.closedDestinationId,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
      queues: queueRows
        .filter((row) => scopedTenantIds.has(row.tenantId))
        .map((row) => {
          const tenantMeta = tenantSlugById.get(row.tenantId);
          if (!tenantMeta) return null;
          return {
            tenantId: row.tenantId,
            tenantSlug: tenantMeta.slug,
            asteriskContext: tenantMeta.asteriskContext,
            queueId: row.id,
            name: row.name,
            asteriskQueueName: row.asteriskQueueName,
            strategy: row.strategy,
            maxWaitSeconds: row.maxWaitSeconds,
            number: row.number,
            mohClassName: row.mohClassId ? (mohClassNameById.get(row.mohClassId) ?? null) : null,
            members: queueMemberRows
              .filter((member) => member.queueId === row.id)
              .map((member) => {
                const ext = extensionById.get(member.extensionId);
                return ext
                  ? {
                      extensionId: member.extensionId,
                      extensionNumber: ext.extensionNumber,
                      asteriskEndpointId: ext.asteriskEndpointId,
                      penalty: member.penalty,
                    }
                  : null;
              })
              .filter((member): member is NonNullable<typeof member> => member !== null),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
      ringGroups: ringGroupRows
        .filter((row) => scopedTenantIds.has(row.tenantId))
        .map((row) => {
          const tenantMeta = tenantSlugById.get(row.tenantId);
          if (!tenantMeta) return null;
          return {
            tenantId: row.tenantId,
            tenantSlug: tenantMeta.slug,
            asteriskContext: tenantMeta.asteriskContext,
            ringGroupId: row.id,
            name: row.name,
            strategy: row.strategy,
            timeoutSeconds: row.timeoutSeconds,
            members: ringGroupMemberRows
              .filter((member) => member.ringGroupId === row.id)
              .map((member) => {
                const ext = extensionById.get(member.extensionId);
                return ext
                  ? {
                      extensionId: member.extensionId,
                      extensionNumber: ext.extensionNumber,
                      asteriskEndpointId: ext.asteriskEndpointId,
                      priority: member.priority,
                    }
                  : null;
              })
              .filter((member): member is NonNullable<typeof member> => member !== null),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
      featureCodes: featureCodeRows
        .filter((row) => scopedTenantIds.has(row.tenantId))
        .map((row) => {
          const tenantMeta = tenantSlugById.get(row.tenantId);
          if (!tenantMeta) return null;
          return {
            tenantId: row.tenantId,
            tenantSlug: tenantMeta.slug,
            asteriskContext: tenantMeta.asteriskContext,
            code: row.code,
            actionType: row.actionType,
            enabled: row.enabled,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
      blacklist: blacklistRows
        .filter((row) => scopedTenantIds.has(row.tenantId))
        .map((row) => {
          const tenantMeta = tenantSlugById.get(row.tenantId);
          if (!tenantMeta) return null;
          return {
            tenantId: row.tenantId,
            tenantSlug: tenantMeta.slug,
            numberPattern: row.numberPattern,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
      mohClasses: mohClassRows
        .filter((row) => scopedTenantIds.has(row.tenantId))
        .map((row) => {
          const tenantMeta = tenantSlugById.get(row.tenantId);
          if (!tenantMeta) return null;
          const mediaIds = Array.isArray(row.mediaFileIds)
            ? (row.mediaFileIds as string[])
            : [];
          const tracks = mediaIds
            .map((mediaId) => {
              const media = mediaById.get(mediaId);
              if (!media) return null;
              return {
                fileName: `${media.name}.${media.format}`,
                storageKey: media.storageKey,
              };
            })
            .filter((track): track is NonNullable<typeof track> => track !== null);
          return {
            tenantId: row.tenantId,
            tenantSlug: tenantMeta.slug,
            mohClassId: row.id,
            name: row.name,
            asteriskClassName: mohClassAsteriskName(tenantMeta.slug, row.id),
            randomize: row.randomize,
            tracks,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
    };
  }

  private async loadGlobalTrunkRecords(): Promise<{
    trunks: TelephonyTrunkRecord[];
    inbound: TelephonyInboundRouteRecord[];
    outbound: TelephonyOutboundRouteRecord[];
  }> {
    return withBypassRls(this.database.db, async (db) => {
      const tenantRows = await db.select().from(tenants).where(eq(tenants.status, 'active'));
      const trunks: TelephonyTrunkRecord[] = [];
      const inbound: TelephonyInboundRouteRecord[] = [];
      const outbound: TelephonyOutboundRouteRecord[] = [];

      for (const tenant of tenantRows) {
        const trunkRows = await db
          .select()
          .from(sipTrunks)
          .where(and(eq(sipTrunks.tenantId, tenant.id), eq(sipTrunks.isActive, true)));

        for (const row of trunkRows) {
          const cfg = (row.config ?? {}) as Record<string, unknown>;
          let username: string | undefined;
          let password: string | undefined;
          if (row.credentialsEncrypted) {
            try {
              const creds = JSON.parse(
                decryptSecret(row.credentialsEncrypted, this.config.encryptionMasterKey),
              ) as { username?: string; password?: string };
              username = creds.username;
              password = creds.password;
            } catch {
              // still render ip-identified inbound trunk
            }
          }

          const endpoints = await db
            .select()
            .from(sipTrunkEndpoints)
            .where(and(eq(sipTrunkEndpoints.trunkId, row.id), eq(sipTrunkEndpoints.isActive, true)));

          const record: TelephonyTrunkRecord = {
            tenantId: row.tenantId,
            tenantSlug: tenant.slug,
            trunkId: row.id,
            name: row.name,
            slug: row.slug,
            asteriskTrunkId: row.asteriskTrunkId,
            authMode: row.authMode as 'registration' | 'ip',
            transport: row.transport as 'udp' | 'tcp' | 'tls',
            isActive: row.isActive,
            allowedCodecs: (cfg.allowedCodecs as string[]) ?? ['ulaw'],
            dtmfMode: (cfg.dtmfMode as 'rfc4733') ?? 'rfc4733',
            maxConcurrentCalls: Number(cfg.maxConcurrentCalls ?? 5),
            maxCallDurationSeconds: Number(cfg.maxCallDurationSeconds ?? 3600),
            allowedDestinationCountries: (cfg.allowedDestinationCountries as string[]) ?? ['US'],
            providerAdapter: row.providerAdapter,
          };
          if (typeof cfg.terminationSipUri === 'string') {
            const match = cfg.terminationSipUri.match(/^sip:([^:;@]+)/i);
            if (match?.[1]) record.registrar = match[1];
          }
          if (endpoints[0]?.host) record.registrar = endpoints[0].host;
          if (username) record.username = username;
          if (password) record.password = password;
          if (typeof cfg.assignedDid === 'string') record.assignedDid = cfg.assignedDid;
          if (typeof cfg.allowedCallerId === 'string') record.allowedCallerId = cfg.allowedCallerId;
          if (Array.isArray(cfg.inboundIpCidrs)) {
            record.inboundIpCidrs = cfg.inboundIpCidrs.filter((v): v is string => typeof v === 'string');
          }
          trunks.push(record);
        }

        const inboundRows = await db
          .select()
          .from(inboundRoutes)
          .where(and(eq(inboundRoutes.tenantId, tenant.id), eq(inboundRoutes.isActive, true)));

        const activeTrunk =
          trunkRows.find((t) => t.isActive) ??
          (await db.select().from(sipTrunks).where(eq(sipTrunks.tenantId, tenant.id))).find((t) => t.isActive);

        for (const route of inboundRows) {
          let destValue = '';
          if (route.destinationType === 'extension' && route.destinationId) {
            const [ext] = await db
              .select()
              .from(extensions)
              .where(eq(extensions.id, route.destinationId))
              .limit(1);
            destValue = ext?.extensionNumber ?? '';
          }
          inbound.push({
            tenantId: tenant.id,
            tenantSlug: tenant.slug,
            asteriskContext: tenant.asteriskContext,
            didPattern: route.didPattern,
            destinationType: route.destinationType as 'extension' | 'ai_agent',
            destinationValue: destValue,
            trunkAsteriskId: activeTrunk?.asteriskTrunkId ?? `${tenant.slug}_trunk_default`,
          });
        }

        const outboundRows = await db
          .select()
          .from(outboundRoutes)
          .where(and(eq(outboundRoutes.tenantId, tenant.id), eq(outboundRoutes.isActive, true)));

        for (const route of outboundRows) {
          const trunk = trunkRows.find((t) => t.id === route.trunkId) ?? activeTrunk;
          const policy = (route.callerIdPolicy ?? {}) as Record<string, string>;
          const out: TelephonyOutboundRouteRecord = {
            tenantId: tenant.id,
            tenantSlug: tenant.slug,
            asteriskContext: tenant.asteriskContext,
            pattern: route.pattern,
            trunkAsteriskId: trunk?.asteriskTrunkId ?? `${tenant.slug}_trunk_default`,
            callerId: policy.callerId ?? '+10000000000',
          };
          if (policy.normalizePrefix) out.normalizePrefix = policy.normalizePrefix;
          outbound.push(out);
        }
      }

      return { trunks, inbound, outbound };
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

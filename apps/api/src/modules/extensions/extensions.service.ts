import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { conflict, notFound, tenantAccessDenied, validationError } from '@pbx/contracts';
import {
  encryptSecret,
  generateSipSecret,
  tenantEndpointId,
  effectiveExtensionRecording,
} from '@pbx/shared';
import type { ExtensionRecordingPolicyMode } from '@pbx/contracts';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import {
  auditEvents,
  calls,
  extensions,
  sipCredentials,
  sipRegistrations,
  tenants,
  withBypassRls,
  withTenantContext,
} from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { TelephonyService, type ExtensionProvisioningState } from '../telephony/telephony.service.js';
import { TenantTelephonySettingsService } from '../telephony/tenant-telephony-settings.service.js';
import { TenantLimitsService } from '../tenants/tenant-limits.service.js';

const ACTIVE_CALL_STATUSES = ['initiating', 'ringing', 'answered', 'held'] as const;

export type ExtensionProvisioningStatus = ExtensionProvisioningState['status'];

export interface CreateExtensionInput {
  extensionNumber: string;
  displayName: string;
}

export interface ExtensionSetupInfo {
  transport: 'UDP';
  port: number;
  authUsernameSameAsUsername: true;
  outboundProxy: 'none';
}

export interface ExtensionProvisioningResponse {
  status: ExtensionProvisioningStatus;
  reason?: string;
}

@Injectable()
export class ExtensionsService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
    @Inject(forwardRef(() => TelephonyService))
    private readonly telephonyService: TelephonyService,
    @Inject(TenantTelephonySettingsService)
    private readonly tenantTelephonySettingsService: TenantTelephonySettingsService,
    @Inject(TenantLimitsService) private readonly tenantLimitsService: TenantLimitsService,
  ) {}

  async createExtension(
    actor: AuthenticatedUser,
    tenantId: string,
    input: CreateExtensionInput,
  ) {
    await this.assertTenantAccess(actor, tenantId);

    const created = await withTenantContext(this.database.db, tenantId, async (db) => {
      await this.tenantLimitsService.assertCanCreateExtensionInTx(db, tenantId);
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) throw notFound('Tenant');
      if (tenant.status === 'suspended') {
        throw validationError({ tenant: 'Tenant is suspended' });
      }

      const [existing] = await db
        .select()
        .from(extensions)
        .where(
          and(
            eq(extensions.tenantId, tenantId),
            eq(extensions.extensionNumber, input.extensionNumber),
          ),
        )
        .limit(1);

      if (existing) {
        throw validationError({ extensionNumber: 'Extension already exists' });
      }

      const asteriskEndpointId = tenantEndpointId(tenant.slug, input.extensionNumber);
      const sipUsername = `${tenant.slug}_${input.extensionNumber}`;
      const sipSecret = generateSipSecret();

      const [extension] = await db
        .insert(extensions)
        .values({
          tenantId,
          extensionNumber: input.extensionNumber,
          displayName: input.displayName,
          asteriskEndpointId,
          status: 'active',
        })
        .returning();

      await db.insert(sipCredentials).values({
        tenantId,
        extensionId: extension!.id,
        username: sipUsername,
        secretEncrypted: encryptSecret(sipSecret, this.config.encryptionMasterKey),
      });

      await withBypassRls(this.database.db, async (adminDb) => {
        await adminDb.insert(auditEvents).values({
          tenantId,
          actorUserId: actor.id,
          actorType: 'user',
          action: 'extension.created',
          resourceType: 'extension',
          resourceId: extension!.id,
          metadata: { extensionNumber: input.extensionNumber },
        });
      });

      return {
        extension: extension!,
        tenant,
        sipUsername,
        sipSecret,
      };
    });

    const provisioning = await this.provisionExtensionAfterPersist(
      actor,
      tenantId,
      created.extension.id,
    );

    return {
      extension: {
        id: created.extension.id,
        tenantId,
        extensionNumber: created.extension.extensionNumber,
        displayName: created.extension.displayName,
        asteriskEndpointId: created.extension.asteriskEndpointId,
        status: created.extension.status,
        createdAt: created.extension.createdAt.toISOString(),
      },
      sipCredential: {
        username: created.sipUsername,
        secret: created.sipSecret,
        domain: this.resolveSipDomain(created.tenant.slug),
      },
      provisioning,
      setup: this.defaultSetupInfo(),
    };
  }

  async rotateSipCredential(actor: AuthenticatedUser, tenantId: string, extensionId: string) {
    await this.assertTenantAccess(actor, tenantId);

    const rotated = await withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select({ extension: extensions, tenant: tenants, credential: sipCredentials })
        .from(extensions)
        .innerJoin(tenants, eq(extensions.tenantId, tenants.id))
        .innerJoin(sipCredentials, eq(sipCredentials.extensionId, extensions.id))
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.id, extensionId)))
        .limit(1);

      if (!row) throw notFound('Extension');
      if (row.extension.status === 'disabled') {
        throw validationError({ extension: 'Extension is deleted' });
      }

      const sipSecret = generateSipSecret();
      await db
        .update(sipCredentials)
        .set({
          secretEncrypted: encryptSecret(sipSecret, this.config.encryptionMasterKey),
          secretVersion: row.credential.secretVersion + 1,
          rotatedAt: new Date(),
        })
        .where(eq(sipCredentials.extensionId, extensionId));

      await withBypassRls(this.database.db, async (adminDb) => {
        await adminDb.insert(auditEvents).values({
          tenantId,
          actorUserId: actor.id,
          actorType: 'user',
          action: 'extension.credential.rotated',
          resourceType: 'extension',
          resourceId: extensionId,
          metadata: { secretVersion: row.credential.secretVersion + 1 },
        });
      });

      return {
        username: row.credential.username,
        secret: sipSecret,
        domain: this.resolveSipDomain(row.tenant.slug),
      };
    });

    const provisioning = await this.provisionExtensionAfterPersist(actor, tenantId, extensionId);

    return {
      sipCredential: rotated,
      provisioning,
      setup: this.defaultSetupInfo(),
      passwordShownOnce: true,
    };
  }

  async deleteExtension(actor: AuthenticatedUser, tenantId: string, extensionId: string) {
    await this.assertTenantAccess(actor, tenantId);

    const existing = await withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(extensions)
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.id, extensionId)))
        .limit(1);
      return row ?? null;
    });

    if (!existing) throw notFound('Extension');
    if (existing.status === 'disabled') {
      const provisioning = await this.telephonyService.getExtensionProvisioningState(
        tenantId,
        extensionId,
      );
      return {
        extensionId,
        status: 'disabled',
        provisioning,
        alreadyDeleted: true,
      };
    }

    await withTenantContext(this.database.db, tenantId, async (db) => {
      const [activeCall] = await db
        .select({ id: calls.id })
        .from(calls)
        .where(
          and(
            eq(calls.tenantId, tenantId),
            inArray(calls.status, [...ACTIVE_CALL_STATUSES]),
            isNull(calls.endedAt),
            or(eq(calls.fromExtensionId, extensionId), eq(calls.toExtensionId, extensionId)),
          ),
        )
        .limit(1);
      if (activeCall) {
        throw conflict('Extension has active calls. Try again after calls end.', {
          extensionId,
        });
      }
    });

    await withTenantContext(this.database.db, tenantId, async (db) => {
      const [cred] = await db
        .select({ secretVersion: sipCredentials.secretVersion })
        .from(sipCredentials)
        .where(eq(sipCredentials.extensionId, extensionId))
        .limit(1);

      await db
        .update(extensions)
        .set({ status: 'disabled', updatedAt: new Date() })
        .where(eq(extensions.id, extensionId));

      const revokedSecret = generateSipSecret();
      await db
        .update(sipCredentials)
        .set({
          secretEncrypted: encryptSecret(revokedSecret, this.config.encryptionMasterKey),
          secretVersion: (cred?.secretVersion ?? 0) + 1,
          rotatedAt: new Date(),
        })
        .where(eq(sipCredentials.extensionId, extensionId));

      await db.delete(sipRegistrations).where(eq(sipRegistrations.extensionId, extensionId));
    });

    let provisioning: ExtensionProvisioningResponse = { status: 'deleting' };
    if (this.config.telephonyEnabled) {
      try {
        await this.telephonyService.provisionGlobalConfiguration(actor, tenantId);
        const removed = await this.telephonyService.verifyExtensionRemovedFromRuntime(
          tenantId,
          extensionId,
        );
        provisioning = removed.removed
          ? { status: 'deleted' }
          : { status: 'failed', reason: removed.reason ?? 'still_provisioned' };
      } catch {
        provisioning = {
          status: 'failed',
          reason: 'provisioning_error',
        };
      }
    } else {
      provisioning = { status: 'deleted', reason: 'telephony_disabled' };
    }

    await withBypassRls(this.database.db, async (adminDb) => {
      await adminDb.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action: 'extension.deleted',
        resourceType: 'extension',
        resourceId: extensionId,
        metadata: {
          extensionNumber: existing.extensionNumber,
          provisioningStatus: provisioning.status,
        },
      });
    });

    return {
      extensionId,
      status: 'disabled',
      provisioning,
      alreadyDeleted: false,
    };
  }

  async reconcileExtension(
    actor: AuthenticatedUser,
    tenantId: string,
    extensionId: string,
    options?: { rotateCredential?: boolean },
  ) {
    await this.assertTenantAccess(actor, tenantId);

    let state: ExtensionProvisioningState = await this.telephonyService.getExtensionProvisioningState(
      tenantId,
      extensionId,
    );
    let rotated: Awaited<ReturnType<ExtensionsService['rotateSipCredential']>> | null = null;

    if (state.reason === 'credential_unavailable') {
      if (!options?.rotateCredential) {
        return {
          provisioning: state,
          rotateRequired: true,
        };
      }
      rotated = await this.rotateSipCredential(actor, tenantId, extensionId);
      state = await this.telephonyService.getExtensionProvisioningState(tenantId, extensionId);
    } else {
      if (this.config.telephonyEnabled) {
        await this.telephonyService.provisionGlobalConfiguration(actor, tenantId);
      }
      state = await this.telephonyService.getExtensionProvisioningState(tenantId, extensionId);
    }

    return {
      provisioning: state,
      ...(rotated
        ? {
            sipCredential: rotated.sipCredential,
            setup: rotated.setup,
          }
        : {}),
    };
  }

  async listExtensions(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantAccess(actor, tenantId);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db
        .select({
          id: extensions.id,
          tenantId: extensions.tenantId,
          extensionNumber: extensions.extensionNumber,
          displayName: extensions.displayName,
          asteriskEndpointId: extensions.asteriskEndpointId,
          status: extensions.status,
          createdAt: extensions.createdAt,
        })
        .from(extensions)
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.status, 'active')));

      const enriched = [];
      for (const row of rows) {
        const provisioning = await this.telephonyService.getExtensionProvisioningState(
          tenantId,
          row.id,
        );
        enriched.push({
          ...row,
          createdAt: row.createdAt.toISOString(),
          provisioning: {
            status: provisioning.status,
            ...(provisioning.reason ? { reason: provisioning.reason } : {}),
          },
        });
      }

      return enriched;
    });
  }

  async getExtension(actor: AuthenticatedUser, tenantId: string, extensionId: string) {
    await this.assertTenantAccess(actor, tenantId);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select()
        .from(extensions)
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.id, extensionId)))
        .limit(1);

      if (!row) throw notFound('Extension');

      const [cred] = await db
        .select({
          username: sipCredentials.username,
          secretVersion: sipCredentials.secretVersion,
          createdAt: sipCredentials.createdAt,
        })
        .from(sipCredentials)
        .where(eq(sipCredentials.extensionId, extensionId))
        .limit(1);

      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      const provisioning = await this.telephonyService.getExtensionProvisioningState(
        tenantId,
        extensionId,
      );
      const orgDefault = await this.tenantTelephonySettingsService.readRecordCallsByDefault(tenantId);
      const mode = (row.recordingPolicyMode ?? 'inherit') as ExtensionRecordingPolicyMode;

      return {
        extension: {
          id: row.id,
          tenantId: row.tenantId,
          extensionNumber: row.extensionNumber,
          displayName: row.displayName,
          asteriskEndpointId: row.asteriskEndpointId,
          status: row.status,
          createdAt: row.createdAt.toISOString(),
        },
        recordingPolicyMode: mode,
        recordingEffective: {
          orgRecordCallsByDefault: orgDefault,
          effectiveRecordingEnabled: effectiveExtensionRecording(orgDefault, mode),
        },
        sipCredential: cred
          ? {
              username: cred.username,
              secretVersion: cred.secretVersion,
              createdAt: cred.createdAt.toISOString(),
            }
          : null,
        sipDomain: tenant ? this.resolveSipDomain(tenant.slug) : null,
        provisioning: {
          status: provisioning.status,
          ...(provisioning.reason ? { reason: provisioning.reason } : {}),
        },
        setup: this.defaultSetupInfo(),
      };
    });
  }

  async updateRecordingPolicy(
    actor: AuthenticatedUser,
    tenantId: string,
    extensionId: string,
    mode: ExtensionRecordingPolicyMode,
  ) {
    await this.assertTenantAccess(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .update(extensions)
        .set({ recordingPolicyMode: mode, updatedAt: new Date() })
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.id, extensionId)))
        .returning();
      if (!row) throw notFound('Extension');
      const orgDefault = await this.tenantTelephonySettingsService.readRecordCallsByDefault(tenantId);
      return {
        extensionId: row.id,
        recordingPolicyMode: mode,
        recordingEffective: {
          orgRecordCallsByDefault: orgDefault,
          effectiveRecordingEnabled: effectiveExtensionRecording(orgDefault, mode),
        },
      };
    });
  }

  private async provisionExtensionAfterPersist(
    actor: AuthenticatedUser,
    tenantId: string,
    extensionId: string,
  ): Promise<ExtensionProvisioningResponse> {
    if (!this.config.telephonyEnabled) {
      return { status: 'pending', reason: 'telephony_disabled' };
    }

    try {
      await this.telephonyService.provisionGlobalConfiguration(actor, tenantId);
      const verified = await this.telephonyService.verifyExtensionRuntime(tenantId, extensionId);
      if (verified.ready) {
        return { status: 'ready' };
      }
      return {
        status: 'failed',
        reason: verified.reason ?? 'not_provisioned',
      };
    } catch {
      const state = await this.telephonyService.getExtensionProvisioningState(tenantId, extensionId);
      return {
        status: 'failed',
        reason: state.reason ?? 'provisioning_error',
      };
    }
  }

  private resolveSipDomain(tenantSlug: string): string {
    const apiHost = this.resolvePublicApiHostname();
    if (apiHost && /^\d+\.\d+\.\d+\.\d+$/.test(apiHost)) {
      return apiHost;
    }
    if (this.config.sipPublicDomain) {
      return this.config.sipPublicDomain;
    }
    if (apiHost) {
      return apiHost;
    }
    return `${tenantSlug}.pbx.local`;
  }

  private resolvePublicApiHostname(): string | null {
    try {
      const host = new URL(this.config.publicApiUrl).hostname;
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return host;
      }
    } catch {
      // fall through
    }
    return null;
  }

  private defaultSetupInfo(): ExtensionSetupInfo {
    return {
      transport: 'UDP',
      port: this.config.sipUdpPort,
      authUsernameSameAsUsername: true,
      outboundProxy: 'none',
    };
  }

  private async assertTenantAccess(actor: AuthenticatedUser, tenantId: string) {
    const isMember = actor.tenantMemberships.some((m) => m.tenantId === tenantId);
    const isPlatform = actor.platformRoles.includes('platform_super_admin');
    const isSupport = actor.supportSession?.tenantId === tenantId;
    if (!isMember && !isPlatform && !isSupport) {
      throw tenantAccessDenied();
    }
  }
}

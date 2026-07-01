import { Inject, Injectable, forwardRef } from '@nestjs/common';
import {
  CreateSipDeviceSchema,
  notFound,
  tenantAccessDenied,
  UpdateSipDeviceSchema,
  validationError,
  type CreateSipDeviceRequest,
  type SipDeviceSummary,
  type UpdateSipDeviceRequest,
} from '@pbx/contracts';
import {
  encryptSecret,
  generateSipSecret,
  tenantEndpointId,
} from '@pbx/shared';
import { and, eq, inArray } from 'drizzle-orm';
import {
  auditEvents,
  extensions,
  sipCredentials,
  sipDevices,
  sipRegistrations,
  tenants,
  withBypassRls,
  withTenantContext,
} from '@pbx/database';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { TelephonyService } from '../telephony/telephony.service.js';
import { TenantLimitsService } from '../tenants/tenant-limits.service.js';

@Injectable()
export class DevicesService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
    @Inject(TenantLimitsService) private readonly tenantLimitsService: TenantLimitsService,
    @Inject(forwardRef(() => TelephonyService))
    private readonly telephonyService: TelephonyService,
  ) {}

  async listExtensionDevices(
    actor: AuthenticatedUser,
    tenantId: string,
    extensionId: string,
  ): Promise<SipDeviceSummary[]> {
    await this.assertDeviceAccess(actor, tenantId);
    await this.ensureLegacyDevice(tenantId, extensionId);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db
        .select({
          device: sipDevices,
          credential: sipCredentials,
          registration: sipRegistrations,
        })
        .from(sipDevices)
        .leftJoin(sipCredentials, eq(sipDevices.sipCredentialId, sipCredentials.id))
        .leftJoin(sipRegistrations, eq(sipRegistrations.extensionId, sipDevices.extensionId))
        .where(and(eq(sipDevices.tenantId, tenantId), eq(sipDevices.extensionId, extensionId)));

      return rows.map(({ device, credential, registration }) =>
        this.toSummary(device, credential, registration),
      );
    });
  }

  async createDevice(
    actor: AuthenticatedUser,
    tenantId: string,
    extensionId: string,
    input: CreateSipDeviceRequest,
  ) {
    await this.assertDeviceAccess(actor, tenantId, true);
    await this.tenantLimitsService.assertCanCreateDevice(tenantId, extensionId);

    const parsed = CreateSipDeviceSchema.parse(input);
    const sipSecret = generateSipSecret();

    const created = await withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select({ extension: extensions, tenant: tenants })
        .from(extensions)
        .innerJoin(tenants, eq(extensions.tenantId, tenants.id))
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.id, extensionId)))
        .limit(1);

      if (!row || row.extension.status === 'disabled') throw notFound('Extension');
      if (row.tenant.status === 'suspended') {
        throw validationError({ tenant: 'Tenant is suspended' });
      }

      const shortId = crypto.randomUUID().slice(0, 8);
      const sipUsername = `${row.tenant.slug}_${row.extension.extensionNumber}_${shortId}`;
      const asteriskEndpointId = `${row.tenant.slug}_ext_${row.extension.extensionNumber}_dev_${shortId}`;

      const [credential] = await db
        .insert(sipCredentials)
        .values({
          tenantId,
          extensionId,
          username: sipUsername,
          secretEncrypted: encryptSecret(sipSecret, this.config.encryptionMasterKey),
        })
        .returning();

      const [device] = await db
        .insert(sipDevices)
        .values({
          tenantId,
          extensionId,
          sipCredentialId: credential!.id,
          deviceType: parsed.deviceType,
          friendlyName: parsed.name,
          status: 'ready',
          provisioningStatus: 'provisioning',
          asteriskEndpointId,
        })
        .returning();

      await withBypassRls(this.database.db, async (adminDb) => {
        await adminDb.insert(auditEvents).values({
          tenantId,
          actorUserId: actor.id,
          actorType: 'user',
          action: 'device.created',
          resourceType: 'sip_device',
          resourceId: device!.id,
          metadata: { extensionId, deviceType: parsed.deviceType },
        });
      });

      return { device: device!, credential: credential!, tenant: row.tenant, sipSecret, sipUsername };
    });

    await this.telephonyService.provisionGlobalConfiguration(actor, tenantId);

    await withTenantContext(this.database.db, tenantId, async (db) => {
      await db
        .update(sipDevices)
        .set({ provisioningStatus: 'ready', updatedAt: new Date() })
        .where(eq(sipDevices.id, created.device.id));
    });

    return {
      device: this.toSummary(created.device, created.credential, null),
      sipCredential: {
        username: created.sipUsername,
        secret: created.sipSecret,
        domain: this.resolveSipDomain(created.tenant.slug),
      },
      setup: {
        transport: 'UDP' as const,
        port: this.config.sipUdpPort,
        authUsernameSameAsUsername: true as const,
        outboundProxy: 'none' as const,
      },
    };
  }

  async rotateDeviceCredential(actor: AuthenticatedUser, tenantId: string, deviceId: string) {
    await this.assertDeviceAccess(actor, tenantId, true);

    const rotated = await withTenantContext(this.database.db, tenantId, async (db) => {
      const [row] = await db
        .select({ device: sipDevices, credential: sipCredentials, tenant: tenants })
        .from(sipDevices)
        .innerJoin(sipCredentials, eq(sipDevices.sipCredentialId, sipCredentials.id))
        .innerJoin(tenants, eq(sipDevices.tenantId, tenants.id))
        .where(and(eq(sipDevices.tenantId, tenantId), eq(sipDevices.id, deviceId)))
        .limit(1);

      if (!row) throw notFound('Device');
      if (row.device.status === 'revoked' || row.device.status === 'disabled') {
        throw validationError({ device: 'Device is not active' });
      }

      const sipSecret = generateSipSecret();
      await db
        .update(sipCredentials)
        .set({
          secretEncrypted: encryptSecret(sipSecret, this.config.encryptionMasterKey),
          secretVersion: row.credential.secretVersion + 1,
          rotatedAt: new Date(),
        })
        .where(eq(sipCredentials.id, row.credential.id));

      await withBypassRls(this.database.db, async (adminDb) => {
        await adminDb.insert(auditEvents).values({
          tenantId,
          actorUserId: actor.id,
          actorType: 'user',
          action: 'device.credential.rotated',
          resourceType: 'sip_device',
          resourceId: deviceId,
          metadata: { secretVersion: row.credential.secretVersion + 1 },
        });
      });

      return { ...row, sipSecret };
    });

    await this.telephonyService.provisionGlobalConfiguration(actor, tenantId);

    return {
      device: this.toSummary(rotated.device, rotated.credential, null),
      sipCredential: {
        username: rotated.credential.username,
        secret: rotated.sipSecret,
        domain: this.resolveSipDomain(rotated.tenant.slug),
      },
      setup: {
        transport: 'UDP' as const,
        port: this.config.sipUdpPort,
        authUsernameSameAsUsername: true as const,
        outboundProxy: 'none' as const,
      },
    };
  }

  async updateDeviceStatus(
    actor: AuthenticatedUser,
    tenantId: string,
    deviceId: string,
    status: 'disabled' | 'ready' | 'revoked',
  ) {
    await this.assertDeviceAccess(actor, tenantId, true);

    const updated = await withTenantContext(this.database.db, tenantId, async (db) => {
      const [device] = await db
        .select()
        .from(sipDevices)
        .where(and(eq(sipDevices.tenantId, tenantId), eq(sipDevices.id, deviceId)))
        .limit(1);

      if (!device) throw notFound('Device');
      if (device.deviceType === 'legacy' && status === 'revoked') {
        throw validationError({ device: 'Legacy device cannot be revoked; rotate credential instead' });
      }

      const patch: Partial<typeof sipDevices.$inferInsert> = {
        status,
        updatedAt: new Date(),
      };
      if (status === 'revoked') patch.revokedAt = new Date();

      const [next] = await db.update(sipDevices).set(patch).where(eq(sipDevices.id, deviceId)).returning();

      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action: `device.${status}`,
        resourceType: 'sip_device',
        resourceId: deviceId,
        metadata: { status },
      });

      return next!;
    });

    await this.telephonyService.provisionGlobalConfiguration(actor, tenantId);
    return { id: updated.id, status: updated.status };
  }

  async ensureLegacyDevice(tenantId: string, extensionId: string): Promise<void> {
    await withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(sipDevices)
        .where(and(eq(sipDevices.extensionId, extensionId), eq(sipDevices.deviceType, 'legacy')))
        .limit(1);

      if (existing) return;

      const [row] = await db
        .select({ extension: extensions, credential: sipCredentials })
        .from(extensions)
        .innerJoin(sipCredentials, eq(sipCredentials.extensionId, extensions.id))
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.id, extensionId)))
        .limit(1);

      if (!row) return;

      await db.insert(sipDevices).values({
        tenantId,
        extensionId,
        sipCredentialId: row.credential.id,
        deviceType: 'legacy',
        friendlyName: 'Default device',
        status: 'ready',
        provisioningStatus: 'ready',
        asteriskEndpointId: row.extension.asteriskEndpointId,
      });
    });
  }

  async backfillLegacyDevices(tenantId?: string): Promise<number> {
    return withBypassRls(this.database.db, async (db) => {
      const extQuery = tenantId
        ? db
            .select({ extension: extensions, credential: sipCredentials })
            .from(extensions)
            .innerJoin(sipCredentials, eq(sipCredentials.extensionId, extensions.id))
            .where(and(eq(extensions.status, 'active'), eq(extensions.tenantId, tenantId)))
        : db
            .select({ extension: extensions, credential: sipCredentials })
            .from(extensions)
            .innerJoin(sipCredentials, eq(sipCredentials.extensionId, extensions.id))
            .where(eq(extensions.status, 'active'));

      const rows = await extQuery;

      let created = 0;
      for (const row of rows) {
        const [existing] = await db
          .select()
          .from(sipDevices)
          .where(and(eq(sipDevices.extensionId, row.extension.id), eq(sipDevices.deviceType, 'legacy')))
          .limit(1);

        if (existing) continue;

        await db.insert(sipDevices).values({
          tenantId: row.extension.tenantId,
          extensionId: row.extension.id,
          sipCredentialId: row.credential.id,
          deviceType: 'legacy',
          friendlyName: 'Default device',
          status: 'ready',
          provisioningStatus: 'ready',
          asteriskEndpointId: row.extension.asteriskEndpointId,
        });
        created += 1;
      }
      return created;
    });
  }

  private toSummary(
    device: typeof sipDevices.$inferSelect,
    credential: typeof sipCredentials.$inferSelect | null,
    registration: typeof sipRegistrations.$inferSelect | null,
  ): SipDeviceSummary {
    let registrationStatus: SipDeviceSummary['registrationStatus'] = 'unknown';
    if (registration?.isRegistered) registrationStatus = 'online';
    else if (registration) registrationStatus = 'offline';

    return {
      id: device.id,
      extensionId: device.extensionId,
      name: device.friendlyName,
      deviceType: device.deviceType as SipDeviceSummary['deviceType'],
      status: device.status as SipDeviceSummary['status'],
      provisioningStatus: device.provisioningStatus,
      sipUsername: credential?.username ?? null,
      registrationStatus,
      lastRegisteredAt: registration?.registeredAt?.toISOString() ?? null,
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      credentialRotatedAt: credential?.rotatedAt?.toISOString() ?? credential?.createdAt?.toISOString() ?? null,
      createdAt: device.createdAt.toISOString(),
      revokedAt: device.revokedAt?.toISOString() ?? null,
    };
  }

  private resolveSipDomain(tenantSlug: string): string {
    return this.config.sipPublicDomain ?? tenantSlug;
  }

  private async assertDeviceAccess(actor: AuthenticatedUser, tenantId: string, mutate = false) {
    const isPlatform = actor.platformRoles.includes('platform_super_admin');
    const membership = actor.tenantMemberships.find((m) => m.tenantId === tenantId);
    const roles = membership?.roles ?? [];
    const canView =
      isPlatform ||
      roles.some((r) =>
        ['tenant_owner', 'tenant_administrator', 'supervisor', 'human_agent'].includes(r),
      );
    const canMutate =
      isPlatform || roles.some((r) => ['tenant_owner', 'tenant_administrator'].includes(r));

    if (mutate && !canMutate) throw tenantAccessDenied();
    if (!mutate && !canView) throw tenantAccessDenied();
  }
}

import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { notFound, validationError, type ProvisionTenantRequest } from '@pbx/contracts';
import { and, count, eq } from 'drizzle-orm';
import {
  auditEvents,
  extensions,
  sipDevices,
  tenantMemberships,
  tenantSettings,
  tenants,
  withBypassRls,
} from '@pbx/database';
import { DATABASE } from '../../common/tokens.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { DevicesService } from '../devices/devices.service.js';
import { ExtensionsService } from '../extensions/extensions.service.js';
import { TelephonyService } from '../telephony/telephony.service.js';
import { TenantLifecycleTelephonyService } from './tenant-lifecycle-telephony.service.js';

export type ProvisioningStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface ProvisioningStep {
  key: string;
  status: ProvisioningStepStatus;
  failureReason?: string | null;
}

export interface TenantProvisioningState {
  tenantId: string;
  status: string;
  steps: ProvisioningStep[];
  canActivate: boolean;
}

const STEP_ORDER = [
  'organization',
  'owner',
  'plan',
  'sip_mode',
  'extensions',
  'devices',
  'recording',
  'telephony',
  'activate',
] as const;

@Injectable()
export class TenantProvisioningService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
    @Inject(forwardRef(() => ExtensionsService))
    private readonly extensionsService: ExtensionsService,
    @Inject(forwardRef(() => DevicesService))
    private readonly devicesService: DevicesService,
    @Inject(forwardRef(() => TelephonyService))
    private readonly telephonyService: TelephonyService,
    @Inject(TenantLifecycleTelephonyService)
    private readonly lifecycleTelephonyService: TenantLifecycleTelephonyService,
  ) {}

  async getState(tenantId: string): Promise<TenantProvisioningState> {
    return withBypassRls(this.database.db, async (db) => {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) throw notFound('Tenant');

      const steps = await this.evaluateSteps(db, tenantId, tenant);
      const canActivate = steps.every(
        (s) => s.key === 'activate' || s.status === 'completed' || s.key === 'recording',
      );

      return { tenantId, status: tenant.status, steps, canActivate };
    });
  }

  async provision(
    actor: AuthenticatedUser,
    tenantId: string,
    input: ProvisionTenantRequest = {},
  ): Promise<TenantProvisioningState & { credentials?: Array<{ extensionNumber: string; username: string; secret: string; domain: string }> }> {
    const credentials: Array<{ extensionNumber: string; username: string; secret: string; domain: string }> = [];

    await withBypassRls(this.database.db, async (db) => {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) throw notFound('Tenant');

      if (tenant.status === 'archived') {
        throw validationError({ tenant: 'Archived tenants cannot be provisioned' });
      }

      if (tenant.status === 'draft') {
        await db.update(tenants).set({ status: 'provisioning', updatedAt: new Date() }).where(eq(tenants.id, tenantId));
      }

      if (input.planId) {
        await db.update(tenants).set({ planId: input.planId, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
      }

      if (input.initialExtensions?.length) {
        for (const ext of input.initialExtensions) {
          const [existing] = await db
            .select()
            .from(extensions)
            .where(and(eq(extensions.tenantId, tenantId), eq(extensions.extensionNumber, ext.extensionNumber)))
            .limit(1);
          if (existing) continue;

          const created = await this.extensionsService.createExtension(actor, tenantId, ext);
          credentials.push({
            extensionNumber: ext.extensionNumber,
            username: created.sipCredential.username,
            secret: created.sipCredential.secret,
            domain: created.sipCredential.domain,
          });
        }
      }

      await this.devicesService.backfillLegacyDevices(tenantId);

      const [deviceCount] = await db
        .select({ total: count() })
        .from(sipDevices)
        .where(eq(sipDevices.tenantId, tenantId));

      if (Number(deviceCount?.total ?? 0) === 0) {
        throw validationError({ devices: 'At least one SIP device is required before activation' });
      }

      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action: 'tenant.provisioning_started',
        resourceType: 'tenant',
        resourceId: tenantId,
        metadata: { stepCount: STEP_ORDER.length },
      });
    });

    const telephony = await this.telephonyService.provisionGlobalConfiguration(actor, tenantId);

    const extRows = await withBypassRls(this.database.db, async (db) =>
      db.select().from(extensions).where(and(eq(extensions.tenantId, tenantId), eq(extensions.status, 'active'))),
    );

    let runtimeReady = true;
    for (const ext of extRows) {
      const runtime = await this.telephonyService.verifyExtensionRuntime(tenantId, ext.id);
      if (!runtime.ready) runtimeReady = false;
    }

    if (!telephony.activated || !runtimeReady) {
      await withBypassRls(this.database.db, async (db) => {
        await db.update(tenants).set({ status: 'failed', updatedAt: new Date() }).where(eq(tenants.id, tenantId));
        await db.insert(auditEvents).values({
          tenantId,
          actorUserId: actor.id,
          actorType: 'user',
          action: 'tenant.provisioning_failed',
          resourceType: 'tenant',
          resourceId: tenantId,
          metadata: { telephonyActivated: telephony.activated, runtimeReady },
        });
      });
      throw validationError({ provisioning: 'Telephony runtime verification failed' });
    }

    await withBypassRls(this.database.db, async (db) => {
      await db.update(tenants).set({ status: 'active', updatedAt: new Date() }).where(eq(tenants.id, tenantId));
      await db.insert(auditEvents).values({
        tenantId,
        actorUserId: actor.id,
        actorType: 'user',
        action: 'tenant.provisioning_completed',
        resourceType: 'tenant',
        resourceId: tenantId,
        metadata: { activated: true },
      });
    });

    const state = await this.getState(tenantId);
    return { ...state, ...(credentials.length ? { credentials } : {}) };
  }

  private async evaluateSteps(
    db: Parameters<Parameters<typeof withBypassRls>[1]>[0],
    tenantId: string,
    tenant: typeof tenants.$inferSelect,
  ): Promise<ProvisioningStep[]> {
    const [owner] = await db
      .select({ total: count() })
      .from(tenantMemberships)
      .where(and(eq(tenantMemberships.tenantId, tenantId), eq(tenantMemberships.status, 'active')));

    const [extCount] = await db
      .select({ total: count() })
      .from(extensions)
      .where(and(eq(extensions.tenantId, tenantId), eq(extensions.status, 'active')));

    const [deviceCount] = await db
      .select({ total: count() })
      .from(sipDevices)
      .where(eq(sipDevices.tenantId, tenantId));

    const [recordingSetting] = await db
      .select()
      .from(tenantSettings)
      .where(and(eq(tenantSettings.tenantId, tenantId), eq(tenantSettings.key, 'telephony.recording')))
      .limit(1);

    const steps: ProvisioningStep[] = [
      { key: 'organization', status: tenant.name && tenant.slug ? 'completed' : 'pending' },
      { key: 'owner', status: Number(owner?.total ?? 0) > 0 ? 'completed' : 'pending' },
      { key: 'plan', status: tenant.planId ? 'completed' : 'pending' },
      { key: 'sip_mode', status: 'completed' },
      { key: 'extensions', status: Number(extCount?.total ?? 0) > 0 ? 'completed' : 'pending' },
      { key: 'devices', status: Number(deviceCount?.total ?? 0) > 0 ? 'completed' : 'pending' },
      { key: 'recording', status: recordingSetting ? 'completed' : 'pending' },
      {
        key: 'telephony',
        status: tenant.status === 'active' ? 'completed' : tenant.status === 'failed' ? 'failed' : 'pending',
      },
      { key: 'activate', status: tenant.status === 'active' ? 'completed' : 'pending' },
    ];

    return steps;
  }
}

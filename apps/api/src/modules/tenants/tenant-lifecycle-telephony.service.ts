import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { validationError, type TenantLifecycleStatus } from '@pbx/contracts';
import { eq } from 'drizzle-orm';
import { auditEvents, extensions, sipCredentials, sipDevices, sipRegistrations, tenants, withBypassRls } from '@pbx/database';
import { DATABASE } from '../../common/tokens.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { TelephonyService } from '../telephony/telephony.service.js';

export interface LifecycleTelephonyResult {
  telephonyReconciled: boolean;
  registrationsCleared: boolean;
  runtimeVerified: boolean;
  failureReason?: string;
}

@Injectable()
export class TenantLifecycleTelephonyService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
    @Inject(forwardRef(() => TelephonyService))
    private readonly telephonyService: TelephonyService,
  ) {}

  async applyLifecycleTelephony(
    actor: AuthenticatedUser,
    tenantId: string,
    previousStatus: TenantLifecycleStatus,
    nextStatus: TenantLifecycleStatus,
  ): Promise<LifecycleTelephonyResult> {
    const result: LifecycleTelephonyResult = {
      telephonyReconciled: false,
      registrationsCleared: false,
      runtimeVerified: false,
    };

    try {
      if (nextStatus === 'suspended' || nextStatus === 'archived') {
        await this.clearTenantRegistrations(tenantId);
        result.registrationsCleared = true;
      }

      if (nextStatus === 'active' && (previousStatus === 'suspended' || previousStatus === 'provisioning' || previousStatus === 'failed')) {
        await this.backfillLegacyDevices(tenantId);
      }

      const provision = await this.telephonyService.provisionGlobalConfiguration(actor, tenantId);
      result.telephonyReconciled = provision.activated;

      if (nextStatus === 'suspended' || nextStatus === 'archived') {
        result.runtimeVerified = await this.verifyTenantAbsentFromRuntime(tenantId);
        if (!result.runtimeVerified) {
          result.failureReason = 'tenant_endpoints_still_present';
        }
      } else if (nextStatus === 'active') {
        result.runtimeVerified = true;
      } else {
        result.runtimeVerified = true;
      }

      await withBypassRls(this.database.db, async (db) => {
        await db.insert(auditEvents).values({
          tenantId,
          actorUserId: actor.id,
          actorType: 'user',
          action: 'tenant.lifecycle_telephony_applied',
          resourceType: 'tenant',
          resourceId: tenantId,
          metadata: {
            from: previousStatus,
            to: nextStatus,
            telephonyReconciled: result.telephonyReconciled,
            registrationsCleared: result.registrationsCleared,
            runtimeVerified: result.runtimeVerified,
            failureReason: result.failureReason ?? null,
          },
        });
      });

      return result;
    } catch (err) {
      result.failureReason = err instanceof Error ? err.message : 'telephony_reconcile_failed';
      await withBypassRls(this.database.db, async (db) => {
        await db.insert(auditEvents).values({
          tenantId,
          actorUserId: actor.id,
          actorType: 'user',
          action: 'tenant.lifecycle_telephony_failed',
          resourceType: 'tenant',
          resourceId: tenantId,
          metadata: {
            from: previousStatus,
            to: nextStatus,
            failureReason: result.failureReason,
          },
        });
      });
      throw validationError({ telephony: result.failureReason });
    }
  }

  private async clearTenantRegistrations(tenantId: string): Promise<void> {
    await withBypassRls(this.database.db, async (db) => {
      await db
        .update(sipRegistrations)
        .set({
          isRegistered: false,
          contact: null,
          userAgent: null,
          sourceIp: null,
          updatedAt: new Date(),
        })
        .where(eq(sipRegistrations.tenantId, tenantId));
    });
  }

  private async backfillLegacyDevices(tenantId: string): Promise<void> {
    await withBypassRls(this.database.db, async (db) => {
      const rows = await db
        .select({ extension: extensions, credential: sipCredentials })
        .from(extensions)
        .innerJoin(sipCredentials, eq(sipCredentials.extensionId, extensions.id))
        .where(eq(extensions.tenantId, tenantId));

      for (const row of rows) {
        const [existing] = await db
          .select()
          .from(sipDevices)
          .where(eq(sipDevices.extensionId, row.extension.id))
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
      }
    });
  }

  private async verifyTenantAbsentFromRuntime(tenantId: string): Promise<boolean> {
    const [tenant] = await withBypassRls(this.database.db, async (db) =>
      db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1),
    );
    if (!tenant) return false;

    const config = await this.telephonyService.buildGlobalConfig();
    const slug = tenant.slug;
    return !config.pjsipTenants.includes(`tenant ${slug}`) && !config.pjsipTenants.includes(`_${slug}_`);
  }
}

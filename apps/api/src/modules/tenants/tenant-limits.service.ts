import { Inject, Injectable } from '@nestjs/common';
import {
  entitlementLimitReached,
  notFound,
  validationError,
  type EntitlementDimension,
  type EntitlementUsage,
  METER_TO_DIMENSION,
} from '@pbx/contracts';
import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  apiApplications,
  calls,
  extensions,
  planEntitlements,
  sipDevices,
  tenantLimitOverrides,
  tenantMemberships,
  tenants,
  users,
  webhookEndpoints,
  withTenantContext,
} from '@pbx/database';
import { DATABASE } from '../../common/tokens.js';

const ACTIVE_MEMBERSHIP_STATUSES = ['active', 'invited'] as const;
const ACTIVE_DEVICE_STATUSES = ['ready', 'provisioning'] as const;

@Injectable()
export class TenantLimitsService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async assertCanCreateExtension(tenantId: string): Promise<void> {
    await this.assertWithinLimit(tenantId, 'max_active_extensions', async (db) => {
      const [usage] = await db
        .select({ total: count() })
        .from(extensions)
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.status, 'active')));
      return Number(usage?.total ?? 0);
    });
  }

  async assertCanInviteUser(tenantId: string): Promise<void> {
    await this.assertWithinLimit(tenantId, 'max_active_portal_users', async (db) => {
      const [usage] = await db
        .select({ total: count() })
        .from(tenantMemberships)
        .innerJoin(users, eq(tenantMemberships.userId, users.id))
        .where(
          and(
            eq(tenantMemberships.tenantId, tenantId),
            inArray(tenantMemberships.status, [...ACTIVE_MEMBERSHIP_STATUSES]),
            eq(users.status, 'active'),
          ),
        );
      return Number(usage?.total ?? 0);
    });
  }

  async assertCanCreateDevice(tenantId: string, extensionId: string): Promise<void> {
    await this.assertWithinLimit(tenantId, 'max_sip_devices', async (db) => {
      const [usage] = await db
        .select({ total: count() })
        .from(sipDevices)
        .where(
          and(
            eq(sipDevices.tenantId, tenantId),
            inArray(sipDevices.status, [...ACTIVE_DEVICE_STATUSES, 'draft']),
          ),
        );
      return Number(usage?.total ?? 0);
    });

    await this.assertWithinLimit(tenantId, 'max_devices_per_extension', async (db) => {
      const [usage] = await db
        .select({ total: count() })
        .from(sipDevices)
        .where(
          and(
            eq(sipDevices.tenantId, tenantId),
            eq(sipDevices.extensionId, extensionId),
            inArray(sipDevices.status, [...ACTIVE_DEVICE_STATUSES, 'draft']),
          ),
        );
      return Number(usage?.total ?? 0);
    });
  }

  async getUsageSummary(tenantId: string): Promise<EntitlementUsage[]> {
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const limits = await this.resolveLimits(db, tenantId);
      const dimensions = Object.keys(limits) as EntitlementDimension[];
      const results: EntitlementUsage[] = [];

      for (const dimension of dimensions) {
        const limit = limits[dimension] ?? null;
        const used = await this.countUsage(db, tenantId, dimension);
        const remaining = limit !== null ? Math.max(0, limit - used) : null;
        results.push({
          dimension,
          used,
          limit,
          remaining,
          overLimit: limit !== null && used > limit,
          grandfathered: limit !== null && used > limit,
        });
      }

      return results;
    });
  }

  private async assertWithinLimit(
    tenantId: string,
    dimension: EntitlementDimension,
    countFn: (db: Parameters<Parameters<typeof withTenantContext>[2]>[0]) => Promise<number>,
  ): Promise<void> {
    await withTenantContext(this.database.db, tenantId, async (db) => {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) throw notFound('Tenant');
      if (tenant.status === 'archived') {
        throw validationError({ tenant: 'Tenant is archived' });
      }

      const limits = await this.resolveLimits(db, tenantId);
      const limit = limits[dimension] ?? null;
      if (limit === null || limit <= 0) {
        return;
      }

      await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${dimension}))`);
      const used = await countFn(db);
      if (used >= limit) {
        throw entitlementLimitReached(dimension, used, limit);
      }
    });
  }

  private async resolveLimits(
    db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
    tenantId: string,
  ): Promise<Partial<Record<EntitlementDimension, number | null>>> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    const overrides = await db
      .select()
      .from(tenantLimitOverrides)
      .where(eq(tenantLimitOverrides.tenantId, tenantId));

    const overrideMap = new Map(
      overrides.map((o) => [o.dimension as EntitlementDimension, Number(o.limitValue)]),
    );

    const result: Partial<Record<EntitlementDimension, number | null>> = {
      max_active_extensions: null,
      max_active_portal_users: null,
      max_sip_devices: null,
      max_devices_per_extension: null,
      max_concurrent_calls: null,
      max_api_applications: null,
      max_webhooks: null,
    };

    for (const [dim, val] of overrideMap) {
      result[dim] = val;
    }

    if (tenant?.planId) {
      const entitlements = await db
        .select()
        .from(planEntitlements)
        .where(eq(planEntitlements.planId, tenant.planId));

      for (const ent of entitlements) {
        const dim = METER_TO_DIMENSION[ent.meterName];
        if (dim && overrideMap.get(dim) === undefined) {
          result[dim] = Number(ent.includedQuantity ?? 0);
        }
      }
    }

    return result;
  }

  private async countUsage(
    db: Parameters<Parameters<typeof withTenantContext>[2]>[0],
    tenantId: string,
    dimension: EntitlementDimension,
  ): Promise<number> {
    switch (dimension) {
      case 'max_active_extensions': {
        const [row] = await db
          .select({ total: count() })
          .from(extensions)
          .where(and(eq(extensions.tenantId, tenantId), eq(extensions.status, 'active')));
        return Number(row?.total ?? 0);
      }
      case 'max_active_portal_users': {
        const [row] = await db
          .select({ total: count() })
          .from(tenantMemberships)
          .where(
            and(
              eq(tenantMemberships.tenantId, tenantId),
              inArray(tenantMemberships.status, [...ACTIVE_MEMBERSHIP_STATUSES]),
            ),
          );
        return Number(row?.total ?? 0);
      }
      case 'max_sip_devices': {
        const [row] = await db
          .select({ total: count() })
          .from(sipDevices)
          .where(
            and(
              eq(sipDevices.tenantId, tenantId),
              inArray(sipDevices.status, [...ACTIVE_DEVICE_STATUSES, 'draft']),
            ),
          );
        return Number(row?.total ?? 0);
      }
      case 'max_devices_per_extension': {
        const rows = await db
          .select({ total: count() })
          .from(sipDevices)
          .where(
            and(
              eq(sipDevices.tenantId, tenantId),
              inArray(sipDevices.status, [...ACTIVE_DEVICE_STATUSES, 'draft']),
            ),
          )
          .groupBy(sipDevices.extensionId);
        return rows.reduce((max, row) => Math.max(max, Number(row.total ?? 0)), 0);
      }
      case 'max_concurrent_calls': {
        const [row] = await db
          .select({ total: count() })
          .from(calls)
          .where(
            and(
              eq(calls.tenantId, tenantId),
              isNull(calls.endedAt),
              inArray(calls.status, ['initiating', 'ringing', 'answered', 'held']),
            ),
          );
        return Number(row?.total ?? 0);
      }
      case 'max_api_applications': {
        const [row] = await db
          .select({ total: count() })
          .from(apiApplications)
          .where(eq(apiApplications.tenantId, tenantId));
        return Number(row?.total ?? 0);
      }
      case 'max_webhooks': {
        const [row] = await db
          .select({ total: count() })
          .from(webhookEndpoints)
          .where(eq(webhookEndpoints.tenantId, tenantId));
        return Number(row?.total ?? 0);
      }
      default:
        return 0;
    }
  }
}

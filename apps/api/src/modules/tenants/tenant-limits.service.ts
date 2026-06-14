import { Inject, Injectable } from '@nestjs/common';
import { conflict } from '@pbx/contracts';
import { and, count, eq } from 'drizzle-orm';
import { extensions, planEntitlements, tenants, withTenantContext } from '@pbx/database';
import { DATABASE } from '../../common/tokens.js';

const EXTENSION_METER = 'max_active_extensions';

@Injectable()
export class TenantLimitsService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async assertCanCreateExtension(tenantId: string): Promise<void> {
    await withTenantContext(this.database.db, tenantId, async (db) => {
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant?.planId) {
        return;
      }

      const [entitlement] = await db
        .select()
        .from(planEntitlements)
        .where(and(eq(planEntitlements.planId, tenant.planId), eq(planEntitlements.meterName, EXTENSION_METER)))
        .limit(1);

      if (!entitlement) {
        return;
      }

      const limit = Number(entitlement.includedQuantity ?? 0);
      if (!Number.isFinite(limit) || limit <= 0) {
        return;
      }

      const [usage] = await db
        .select({ total: count() })
        .from(extensions)
        .where(and(eq(extensions.tenantId, tenantId), eq(extensions.status, 'active')));

      if (Number(usage?.total ?? 0) >= limit) {
        throw conflict('Extension limit reached for current plan');
      }
    });
  }
}

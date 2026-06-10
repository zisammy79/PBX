import { Inject, Injectable } from '@nestjs/common';
import { tenantAccessDenied } from '@pbx/contracts';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { aiUsage, withTenantContext } from '@pbx/database';
import { DATABASE } from '../../common/tokens.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import type { AiUsageListQuerySchema } from '@pbx/contracts';
import type { z } from 'zod';

type UsageQuery = z.infer<typeof AiUsageListQuerySchema>;

@Injectable()
export class AiUsageService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async list(actor: AuthenticatedUser, tenantId: string, query: UsageQuery) {
    await this.assertTenantAccess(actor, tenantId);
    const offset = (query.page - 1) * query.limit;

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const filters = [eq(aiUsage.tenantId, tenantId)];
      if (query.callId) filters.push(eq(aiUsage.callId, query.callId));
      if (query.sessionId) filters.push(eq(aiUsage.sessionId, query.sessionId));
      if (query.meterName) filters.push(eq(aiUsage.meterName, query.meterName));
      if (query.from) filters.push(gte(aiUsage.recordedAt, new Date(query.from)));
      if (query.to) filters.push(lte(aiUsage.recordedAt, new Date(query.to)));

      const whereClause = filters.length === 1 ? filters[0] : and(...filters);

      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiUsage)
        .where(whereClause);

      const rows = await db
        .select()
        .from(aiUsage)
        .where(whereClause)
        .orderBy(desc(aiUsage.recordedAt))
        .limit(query.limit)
        .offset(offset);

      return {
        items: rows.map((row) => this.serialize(row)),
        page: query.page,
        limit: query.limit,
        total: countRow?.count ?? 0,
      };
    });
  }

  private serialize(row: typeof aiUsage.$inferSelect) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      sessionId: row.sessionId,
      callId: row.callId,
      provider: row.provider,
      meterName: row.meterName,
      quantity: row.quantity,
      unit: row.unit,
      measurementSource: row.measurementSource,
      correlationId: row.correlationId,
      costAmount: row.costAmount,
      costCurrency: row.costCurrency,
      recordedAt: row.recordedAt.toISOString(),
    };
  }

  private async assertTenantAccess(actor: AuthenticatedUser, tenantId: string) {
    const isMember = actor.tenantMemberships.some((m) => m.tenantId === tenantId);
    const isPlatform =
      actor.platformRoles.includes('platform_super_admin') ||
      actor.platformRoles.includes('platform_support_operator');
    if (!isMember && !isPlatform) throw tenantAccessDenied();
  }
}

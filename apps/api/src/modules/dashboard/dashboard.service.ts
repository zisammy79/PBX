import { Inject, Injectable } from '@nestjs/common';
import { tenantAccessDenied } from '@pbx/contracts';
import { and, count, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import {
  aiSessions,
  auditEvents,
  calls,
  extensions,
  invoices,
  ratedUsage,
  sipRegistrations,
  tenants,
  usageEvents,
  withBypassRls,
  withTenantContext,
} from '@pbx/database';
import { DATABASE } from '../../common/tokens.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { HealthService } from '../health/health.service.js';
import { previewInvoice } from '../billing/invoice.service.js';
import { resolveTenantBillingContext } from '../billing/rating.service.js';

const ACTIVE_CALL_STATUSES = ['initiating', 'ringing', 'answered', 'held'] as const;
const ACTIVE_SESSION_STATUSES = ['connecting', 'active', 'transferring'] as const;

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
    @Inject(HealthService) private readonly healthService: HealthService,
  ) {}

  async tenantSummary(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantAccess(actor, tenantId);
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [activeCallsRow] = await db
        .select({ total: count() })
        .from(calls)
        .where(
          and(
            eq(calls.tenantId, tenantId),
            inArray(calls.status, [...ACTIVE_CALL_STATUSES]),
            isNull(calls.endedAt),
          ),
        );

      const [todayCallsRow] = await db
        .select({ total: count() })
        .from(calls)
        .where(and(eq(calls.tenantId, tenantId), gte(calls.startedAt, startOfDay)));

      const [completedTodayRow] = await db
        .select({ total: count() })
        .from(calls)
        .where(
          and(
            eq(calls.tenantId, tenantId),
            eq(calls.status, 'completed'),
            gte(calls.startedAt, startOfDay),
          ),
        );

      const [failedTodayRow] = await db
        .select({ total: count() })
        .from(calls)
        .where(
          and(
            eq(calls.tenantId, tenantId),
            eq(calls.status, 'failed'),
            gte(calls.startedAt, startOfDay),
          ),
        );

      const extRows = await db
        .select({ id: extensions.id })
        .from(extensions)
        .where(eq(extensions.tenantId, tenantId));

      const regRows = await db
        .select({ extensionId: sipRegistrations.extensionId })
        .from(sipRegistrations)
        .where(and(eq(sipRegistrations.tenantId, tenantId), eq(sipRegistrations.isRegistered, true)));

      const registeredIds = new Set(regRows.map((r) => r.extensionId));

      const recentCalls = await db
        .select()
        .from(calls)
        .where(eq(calls.tenantId, tenantId))
        .orderBy(desc(calls.startedAt))
        .limit(8);

      const [activeSessionsRow] = await db
        .select({ total: count() })
        .from(aiSessions)
        .where(
          and(
            eq(aiSessions.tenantId, tenantId),
            inArray(aiSessions.status, [...ACTIVE_SESSION_STATUSES]),
            isNull(aiSessions.endedAt),
          ),
        );

      const [usageEventsRow] = await db
        .select({ total: count() })
        .from(usageEvents)
        .where(eq(usageEvents.tenantId, tenantId));

      const [unratedRow] = await db
        .select({ total: count() })
        .from(ratedUsage)
        .where(and(eq(ratedUsage.tenantId, tenantId), eq(ratedUsage.ratingStatus, 'unrated')));

      const ctx = await resolveTenantBillingContext(db, tenantId);
      const periodEnd = new Date();
      const periodStart = new Date(periodEnd);
      periodStart.setUTCDate(1);
      periodStart.setUTCHours(0, 0, 0, 0);

      let invoicePreview: Record<string, unknown> | null = null;
      try {
        invoicePreview = await previewInvoice(db, tenantId, {
          periodStart: periodStart.toISOString(),
          periodEnd: periodEnd.toISOString(),
          currency: ctx.currency,
        });
      } catch {
        invoicePreview = null;
      }

      return {
        calls: {
          active: Number(activeCallsRow?.total ?? 0),
          todayTotal: Number(todayCallsRow?.total ?? 0),
          todayCompleted: Number(completedTodayRow?.total ?? 0),
          todayFailed: Number(failedTodayRow?.total ?? 0),
          recent: recentCalls.map((c) => ({
            id: c.id,
            direction: c.direction,
            status: c.status,
            callerNumber: c.callerNumber,
            calleeNumber: c.calleeNumber,
            startedAt: c.startedAt.toISOString(),
            durationSeconds: c.durationSeconds,
          })),
        },
        extensions: {
          total: extRows.length,
          registered: extRows.filter((e) => registeredIds.has(e.id)).length,
          unregistered: extRows.filter((e) => !registeredIds.has(e.id)).length,
        },
        aiSessions: {
          active: Number(activeSessionsRow?.total ?? 0),
        },
        usage: {
          normalizedEventCount: Number(usageEventsRow?.total ?? 0),
          unratedCount: Number(unratedRow?.total ?? 0),
          providerCostStatus: 'UNAVAILABLE',
        },
        billing: invoicePreview
          ? {
              previewTotal: invoicePreview.total,
              currency: invoicePreview.currency,
              stripeStatus: 'DISABLED',
              providerCostStatus: 'UNAVAILABLE',
            }
          : null,
        subscription: ctx.sub
          ? {
              id: ctx.sub.id,
              status: ctx.sub.status,
              planId: ctx.plan?.id ?? ctx.sub.planId,
              planName: ctx.plan?.name ?? null,
              monthlyAmount: ctx.plan?.monthlyAmount ?? null,
              currency: ctx.plan?.currency ?? ctx.currency,
              entitlements: ctx.entitlements,
            }
          : null,
      };
    });
  }

  async platformSummary(actor: AuthenticatedUser) {
    if (!actor.platformRoles.includes('platform_super_admin')) {
      throw tenantAccessDenied();
    }

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    return withBypassRls(this.database.db, async (db) => {
      const tenantRows = await db.select({ status: tenants.status }).from(tenants);
      const statusCounts = tenantRows.reduce(
        (acc, t) => {
          acc[t.status] = (acc[t.status] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      const [activeCallsRow] = await db
        .select({ total: count() })
        .from(calls)
        .where(
          and(
            inArray(calls.status, [...ACTIVE_CALL_STATUSES]),
            isNull(calls.endedAt),
          ),
        );

      const [failedTodayRow] = await db
        .select({ total: count() })
        .from(calls)
        .where(and(eq(calls.status, 'failed'), gte(calls.startedAt, startOfDay)));

      const [activeSessionsRow] = await db
        .select({ total: count() })
        .from(aiSessions)
        .where(
          and(
            inArray(aiSessions.status, [...ACTIVE_SESSION_STATUSES]),
            isNull(aiSessions.endedAt),
          ),
        );

      const [usageTodayRow] = await db
        .select({ total: count() })
        .from(usageEvents)
        .where(gte(usageEvents.eventTimestamp, startOfDay));

      const invoiceStatusRows = await db
        .select({ status: invoices.status, total: count() })
        .from(invoices)
        .groupBy(invoices.status);

      const [ratedRevenueRow] = await db
        .select({
          total: sql<string>`coalesce(sum(${ratedUsage.customerCharge}), 0)`,
        })
        .from(ratedUsage)
        .where(eq(ratedUsage.ratingStatus, 'rated'));

      const recentAudit = await db
        .select()
        .from(auditEvents)
        .orderBy(desc(auditEvents.createdAt))
        .limit(10);

      const dependencies = await this.healthService.checkDependencies();

      return {
        tenants: {
          total: tenantRows.length,
          active: statusCounts.active ?? 0,
          suspended: statusCounts.suspended ?? 0,
          trialing: statusCounts.trial ?? 0,
        },
        calls: {
          active: Number(activeCallsRow?.total ?? 0),
          failedToday: Number(failedTodayRow?.total ?? 0),
        },
        aiSessions: { active: Number(activeSessionsRow?.total ?? 0) },
        usage: { eventsToday: Number(usageTodayRow?.total ?? 0) },
        billing: {
          invoiceStatusCounts: Object.fromEntries(
            invoiceStatusRows.map((r) => [r.status, Number(r.total)]),
          ),
          ratedRevenueTotal: ratedRevenueRow?.total ?? '0',
          stripeStatus: 'DISABLED',
        },
        health: {
          status: this.healthService.aggregateStatus(dependencies),
          dependencies,
          checkedAt: new Date().toISOString(),
        },
        recentAudit: recentAudit.map((e) => ({
          id: e.id,
          tenantId: e.tenantId,
          action: e.action,
          resourceType: e.resourceType,
          resourceId: e.resourceId,
          createdAt: e.createdAt.toISOString(),
        })),
      };
    });
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

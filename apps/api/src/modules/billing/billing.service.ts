import { Inject, Injectable } from '@nestjs/common';
import { notFound, tenantAccessDenied } from '@pbx/contracts';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import {
  creditLedger,
  invoiceLines,
  invoices,
  planEntitlements,
  plans,
  priceBooks,
  prices,
  ratedUsage,
  usageEvents,
  withTenantContext,
} from '@pbx/database';
import { DATABASE } from '../../common/tokens.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import type {
  CreatePlan,
  CreatePrice,
  CreditAdjustmentRequest,
  InvoiceGenerateRequest,
  InvoicePreviewRequest,
  UpdatePlan,
  UpdatePrice,
} from '@pbx/contracts';
import {
  applyCreditAdjustment,
  finalizeInvoice,
  generateInvoice,
  previewInvoice,
  voidInvoice,
} from './invoice.service.js';
import { resolveTenantBillingContext, runRatingPipeline } from './rating.service.js';
import { EventPublicationService } from '../events/event-publication.service.js';
import { IdempotencyService } from '../../common/services/idempotency.service.js';

@Injectable()
export class BillingService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
    @Inject(EventPublicationService) private readonly events: EventPublicationService,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  async listPlans(actor: AuthenticatedUser) {
    this.assertPlatformOrTenantBilling(actor);
    return this.database.db.select().from(plans).orderBy(desc(plans.createdAt));
  }

  async getPlan(actor: AuthenticatedUser, id: string) {
    this.assertPlatformOrTenantBilling(actor);
    const [row] = await this.database.db.select().from(plans).where(eq(plans.id, id)).limit(1);
    if (!row) throw notFound('Plan');
    const entitlements = await this.database.db
      .select()
      .from(planEntitlements)
      .where(eq(planEntitlements.planId, id));
    return { ...row, entitlements };
  }

  async createPlan(actor: AuthenticatedUser, input: CreatePlan) {
    this.assertPlatformAdmin(actor);
    const [row] = await this.database.db
      .insert(plans)
      .values({
        name: input.name,
        slug: input.slug,
        priceBookId: input.priceBookId,
        monthlyAmount: input.monthlyAmount,
        currency: input.currency,
        trialDays: input.trialDays,
        isPublic: input.isPublic,
      })
      .returning();
    if (input.entitlements?.length) {
      for (const ent of input.entitlements) {
        await this.database.db.insert(planEntitlements).values({
          planId: row!.id,
          meterName: ent.meterName,
          includedQuantity: ent.includedQuantity,
          unit: ent.unit,
        });
      }
    }
    return row;
  }

  async updatePlan(actor: AuthenticatedUser, id: string, input: UpdatePlan) {
    this.assertPlatformAdmin(actor);
    const patch: Partial<typeof plans.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.priceBookId !== undefined) patch.priceBookId = input.priceBookId;
    if (input.monthlyAmount !== undefined) patch.monthlyAmount = input.monthlyAmount;
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.trialDays !== undefined) patch.trialDays = input.trialDays;
    if (input.isPublic !== undefined) patch.isPublic = input.isPublic;
    const [row] = await this.database.db.update(plans).set(patch).where(eq(plans.id, id)).returning();
    if (!row) throw notFound('Plan');
    return row;
  }

  async listPrices(actor: AuthenticatedUser, priceBookId?: string) {
    this.assertPlatformOrTenantBilling(actor);
    if (priceBookId) {
      return this.database.db.select().from(prices).where(eq(prices.priceBookId, priceBookId));
    }
    return this.database.db.select().from(prices).orderBy(desc(prices.createdAt));
  }

  async getPrice(actor: AuthenticatedUser, id: string) {
    this.assertPlatformOrTenantBilling(actor);
    const [row] = await this.database.db.select().from(prices).where(eq(prices.id, id)).limit(1);
    if (!row) throw notFound('Price');
    return row;
  }

  async createPrice(actor: AuthenticatedUser, input: CreatePrice) {
    this.assertPlatformAdmin(actor);
    const [row] = await this.database.db
      .insert(prices)
      .values({
        priceBookId: input.priceBookId,
        meterName: input.meterName,
        unitAmount: input.unitAmount,
        unit: input.unit,
        billingIncrement: input.billingIncrement,
        minimumCharge: input.minimumCharge,
        pricingModel: input.pricingModel ?? 'PER_UNIT',
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
        isActive: input.isActive ?? true,
      })
      .returning();
    return row;
  }

  async updatePrice(actor: AuthenticatedUser, id: string, input: UpdatePrice) {
    this.assertPlatformAdmin(actor);
    const [existing] = await this.database.db.select().from(prices).where(eq(prices.id, id)).limit(1);
    if (!existing) throw notFound('Price');

    if (input.unitAmount !== undefined || input.pricingModel !== undefined) {
      await this.database.db.update(prices).set({ isActive: false, effectiveTo: new Date() }).where(eq(prices.id, id));
      const [row] = await this.database.db
        .insert(prices)
        .values({
          priceBookId: existing.priceBookId,
          meterName: input.meterName ?? existing.meterName,
          unitAmount: input.unitAmount ?? existing.unitAmount,
          unit: input.unit ?? existing.unit,
          billingIncrement: input.billingIncrement ?? existing.billingIncrement,
          minimumCharge: input.minimumCharge ?? existing.minimumCharge,
          pricingModel: input.pricingModel ?? existing.pricingModel,
          effectiveFrom: new Date(),
          isActive: input.isActive ?? true,
        })
        .returning();
      return row;
    }

    const [row] = await this.database.db
      .update(prices)
      .set({
        meterName: input.meterName,
        unit: input.unit,
        billingIncrement: input.billingIncrement,
        minimumCharge: input.minimumCharge,
        isActive: input.isActive,
        effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
      })
      .where(eq(prices.id, id))
      .returning();
    return row;
  }

  async listUsage(actor: AuthenticatedUser, tenantId: string, from?: string, to?: string) {
    await this.assertTenantBilling(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const filters = [eq(usageEvents.tenantId, tenantId)];
      if (from) filters.push(gte(usageEvents.eventTimestamp, new Date(from)));
      if (to) filters.push(lte(usageEvents.eventTimestamp, new Date(to)));
      return db
        .select()
        .from(usageEvents)
        .where(filters.length === 1 ? filters[0] : and(...filters))
        .orderBy(desc(usageEvents.eventTimestamp))
        .limit(100);
    });
  }

  async listRatedUsage(actor: AuthenticatedUser, tenantId: string, from?: string, to?: string) {
    await this.assertTenantBilling(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const rows = await db
        .select({ rated: ratedUsage, event: usageEvents })
        .from(ratedUsage)
        .innerJoin(usageEvents, eq(ratedUsage.usageEventId, usageEvents.id))
        .where(eq(ratedUsage.tenantId, tenantId))
        .orderBy(desc(ratedUsage.ratedAt))
        .limit(100);
      return rows.map((r) => ({
        ...r.rated,
        meterName: r.event.meterName,
        eventTimestamp: r.event.eventTimestamp,
      }));
    });
  }

  async rateTenantUsage(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantBilling(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => runRatingPipeline(db, tenantId));
  }

  async listCredits(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantBilling(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) =>
      db.select().from(creditLedger).where(eq(creditLedger.tenantId, tenantId)).orderBy(desc(creditLedger.createdAt)),
    );
  }

  async applyCreditAdjustment(actor: AuthenticatedUser, tenantId: string, input: CreditAdjustmentRequest) {
    await this.assertTenantBilling(actor, tenantId);
    const { idempotencyKey, ...payload } = input;
    const result = await this.idempotency.execute(
      tenantId,
      'credits:adjustments',
      idempotencyKey,
      payload,
      async () => {
        const entry = await withTenantContext(this.database.db, tenantId, async (db) =>
          applyCreditAdjustment(db, tenantId, payload.amount, payload.currency, payload.reason, actor.id),
        );
        return { status: 201, body: entry as Record<string, unknown> };
      },
    );
    return result.body;
  }

  async listInvoices(actor: AuthenticatedUser, tenantId: string, status?: string) {
    await this.assertTenantBilling(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const filters = [eq(invoices.tenantId, tenantId)];
      if (status) filters.push(eq(invoices.status, status as typeof invoices.$inferSelect.status));
      return db
        .select()
        .from(invoices)
        .where(filters.length === 1 ? filters[0] : and(...filters))
        .orderBy(desc(invoices.createdAt));
    });
  }

  async getInvoice(actor: AuthenticatedUser, tenantId: string, invoiceId: string) {
    await this.assertTenantBilling(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [invoice] = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId)))
        .limit(1);
      if (!invoice) throw notFound('Invoice');
      const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
      return { invoice, lines };
    });
  }

  async previewInvoice(actor: AuthenticatedUser, tenantId: string, input: InvoicePreviewRequest) {
    await this.assertTenantBilling(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => previewInvoice(db, tenantId, input));
  }

  async generateInvoice(actor: AuthenticatedUser, tenantId: string, input: InvoiceGenerateRequest) {
    await this.assertTenantBilling(actor, tenantId);
    const buildInput = {
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      currency: input.currency,
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    };
    const result = await withTenantContext(this.database.db, tenantId, async (db) =>
      generateInvoice(db, tenantId, buildInput, actor.id),
    );
    void this.events.publish(tenantId, 'invoice.generated', {
      invoiceId: result.invoice!.id,
      status: result.invoice!.status,
      total: result.invoice!.total,
      currency: result.invoice!.currency,
    });
    return result;
  }

  async finalizeInvoice(actor: AuthenticatedUser, tenantId: string, invoiceId: string) {
    await this.assertTenantBilling(actor, tenantId);
    const result = await withTenantContext(this.database.db, tenantId, async (db) =>
      finalizeInvoice(db, tenantId, invoiceId, actor.id),
    );
    void this.events.publish(tenantId, 'invoice.finalized', {
      invoiceId: result.invoice!.id,
      status: result.invoice!.status,
      total: result.invoice!.total,
      currency: result.invoice!.currency,
    });
    return result;
  }

  async voidInvoice(actor: AuthenticatedUser, tenantId: string, invoiceId: string) {
    await this.assertTenantBilling(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) =>
      voidInvoice(db, tenantId, invoiceId, actor.id),
    );
  }

  async ensureDefaultPriceBook(actor: AuthenticatedUser) {
    this.assertPlatformAdmin(actor);
    const [existing] = await this.database.db.select().from(priceBooks).limit(1);
    if (existing) return existing;
    const [book] = await this.database.db
      .insert(priceBooks)
      .values({
        name: 'Default Platform Price Book',
        currency: 'USD',
        effectiveFrom: new Date('2026-01-01T00:00:00Z'),
        isActive: true,
      })
      .returning();
    const meters = [
      { meterName: 'ai_realtime_session_seconds', unitAmount: '0.002', unit: 'seconds' },
      { meterName: 'ai_input_audio_seconds', unitAmount: '0.001', unit: 'seconds' },
      { meterName: 'ai_output_audio_seconds', unitAmount: '0.0015', unit: 'seconds' },
      { meterName: 'ai_tool_calls', unitAmount: '0.05', unit: 'count' },
      { meterName: 'internal_call_seconds', unitAmount: '0.001', unit: 'seconds' },
    ];
    for (const meter of meters) {
      await this.database.db.insert(prices).values({ priceBookId: book!.id, ...meter, pricingModel: 'PER_UNIT' });
    }
    return book;
  }

  async getSubscription(actor: AuthenticatedUser, tenantId: string) {
    await this.assertTenantBilling(actor, tenantId);
    return withTenantContext(this.database.db, tenantId, async (db) => {
      const ctx = await resolveTenantBillingContext(db, tenantId);
      return {
        subscription: ctx.sub,
        plan: ctx.plan,
        entitlements: ctx.entitlements,
        currency: ctx.currency,
      };
    });
  }

  private assertPlatformAdmin(actor: AuthenticatedUser) {
    if (!actor.platformRoles.includes('platform_super_admin')) throw tenantAccessDenied();
  }

  private assertPlatformOrTenantBilling(actor: AuthenticatedUser) {
    const ok =
      actor.platformRoles.includes('platform_super_admin') ||
      actor.tenantMemberships.some(
        (m) => m.roles.includes('tenant_owner') || m.roles.includes('tenant_billing_administrator'),
      );
    if (!ok) throw tenantAccessDenied();
  }

  private async assertTenantBilling(actor: AuthenticatedUser, tenantId: string) {
    const isMember = actor.tenantMemberships.some((m) => m.tenantId === tenantId);
    const isPlatform = actor.platformRoles.includes('platform_super_admin');
    if (!isMember && !isPlatform) throw tenantAccessDenied();
  }
}

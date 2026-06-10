import { notFound, validationError } from '@pbx/contracts';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import {
  auditEvents,
  creditLedger,
  invoiceLines,
  invoices,
  ratedUsage,
  tenantBillingProfiles,
  usageEvents,
} from '@pbx/database';
import { redactObject } from '@pbx/shared';
import {
  addDecimal,
  minDecimal,
  mulDecimal,
  roundMoney,
  subDecimal,
} from './money.js';
import {
  assertCurrencyMatch,
  getCreditBalance,
  resolveTenantBillingContext,
  runRatingPipeline,
  type BillingDb,
} from './rating.service.js';

export type InvoiceBuildInput = {
  periodStart: string;
  periodEnd: string;
  currency: string;
  idempotencyKey?: string;
};

export type InvoiceLineDraft = {
  lineType: string;
  description: string;
  quantity: string;
  unitAmount: string;
  amount: string;
  meterName?: string;
  usageEventId?: string;
  snapshot: Record<string, unknown>;
};

export async function ensureBillingProfile(db: BillingDb, tenantId: string, currency: string) {
  const [existing] = await db
    .select()
    .from(tenantBillingProfiles)
    .where(eq(tenantBillingProfiles.tenantId, tenantId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(tenantBillingProfiles)
    .values({ tenantId, billingCurrency: currency })
    .returning();
  return created!;
}

export async function buildInvoiceLines(
  db: BillingDb,
  tenantId: string,
  input: InvoiceBuildInput,
): Promise<{
  lines: InvoiceLineDraft[];
  subtotal: string;
  tax: string;
  creditApplied: string;
  total: string;
  currency: string;
  taxRate: string;
  taxInclusive: boolean;
  metadata: Record<string, unknown>;
}> {
  await runRatingPipeline(db, tenantId);
  const ctx = await resolveTenantBillingContext(db, tenantId);
  const profile = await ensureBillingProfile(db, tenantId, input.currency);
  assertCurrencyMatch(profile.billingCurrency, input.currency);

  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);
  const taxRate = String(profile.taxRate ?? '0');
  const taxInclusive = profile.taxInclusive ?? false;

  const usageRows = await db
    .select({
      event: usageEvents,
      rated: ratedUsage,
    })
    .from(ratedUsage)
    .innerJoin(usageEvents, eq(ratedUsage.usageEventId, usageEvents.id))
    .where(
      and(
        eq(ratedUsage.tenantId, tenantId),
        eq(ratedUsage.ratingStatus, 'rated'),
        gte(usageEvents.eventTimestamp, periodStart),
        lte(usageEvents.eventTimestamp, periodEnd),
      ),
    )
    .orderBy(desc(usageEvents.eventTimestamp));

  const meterTotals = new Map<string, { quantity: number; charge: number; events: string[] }>();
  for (const row of usageRows) {
    const meter = row.event.meterName;
    const current = meterTotals.get(meter) ?? { quantity: 0, charge: 0, events: [] };
    current.quantity += Number(row.event.quantity);
    current.charge += Number(row.rated.customerCharge);
    current.events.push(row.event.id);
    meterTotals.set(meter, current);
  }

  const entitlementByMeter = new Map(
    ctx.entitlements.map((e) => [e.meterName, Number(e.includedQuantity)]),
  );

  const lines: InvoiceLineDraft[] = [];

  if (ctx.plan?.monthlyAmount && Number(ctx.plan.monthlyAmount) > 0) {
    lines.push({
      lineType: 'subscription',
      description: `Subscription — ${ctx.plan.name}`,
      quantity: '1',
      unitAmount: String(ctx.plan.monthlyAmount),
      amount: roundMoney(String(ctx.plan.monthlyAmount)),
      snapshot: { planId: ctx.plan.id, type: 'flat_recurring' },
    });
  }

  for (const [meterName, totals] of meterTotals) {
    const included = entitlementByMeter.get(meterName) ?? 0;
    const includedQty = Math.min(included, totals.quantity);
    const overageQty = Math.max(0, totals.quantity - includedQty);
    const avgUnit = totals.quantity > 0 ? totals.charge / totals.quantity : 0;

    if (includedQty > 0) {
      lines.push({
        lineType: 'included',
        description: `${meterName} included allowance`,
        quantity: includedQty.toFixed(6),
        unitAmount: '0',
        amount: '0.00',
        meterName,
        snapshot: { includedQuantity: includedQty, allowanceApplied: true },
      });
    }

    if (overageQty > 0) {
      const overageAmount = roundMoney(mulDecimal(avgUnit, overageQty));
      lines.push({
        lineType: 'overage',
        description: `${meterName} overage`,
        quantity: overageQty.toFixed(6),
        unitAmount: avgUnit.toFixed(6),
        amount: overageAmount,
        meterName,
        snapshot: { overageQuantity: overageQty, includedQuantity: includedQty },
      });
    } else if (includedQty === 0) {
      lines.push({
        lineType: 'usage',
        description: `${meterName} usage`,
        quantity: totals.quantity.toFixed(6),
        unitAmount: avgUnit.toFixed(6),
        amount: roundMoney(String(totals.charge)),
        meterName,
        snapshot: { eventCount: totals.events.length },
      });
    }
  }

  const subtotal = roundMoney(
    lines.reduce((sum, line) => sum + Number(line.amount), 0).toFixed(6),
  );

  let tax = '0.00';
  if (!taxInclusive && Number(taxRate) > 0) {
    tax = roundMoney(mulDecimal(subtotal, taxRate));
  } else if (taxInclusive && Number(taxRate) > 0) {
    tax = roundMoney(mulDecimal(subtotal, Number(taxRate) / (1 + Number(taxRate))));
  }

  const preCreditTotal = roundMoney(addDecimal(subtotal, tax));
  const creditBalance = await getCreditBalance(db, tenantId, input.currency);
  const creditApplied = roundMoney(minDecimal(creditBalance, preCreditTotal));
  const total = roundMoney(subDecimal(preCreditTotal, creditApplied));

  return {
    lines,
    subtotal,
    tax,
    creditApplied,
    total,
    currency: input.currency,
    taxRate,
    taxInclusive,
    metadata: {
      stripeStatus: 'DISABLED',
      providerCostStatus: 'UNAVAILABLE',
      lateUsagePolicy:
        'Late-arriving usage with event_timestamp in a closed period is billed in the next period as adjustment lines.',
      allowanceBehavior: 'Included usage applied before overage per meter',
    },
  };
}

export async function previewInvoice(db: BillingDb, tenantId: string, input: InvoiceBuildInput) {
  const built = await buildInvoiceLines(db, tenantId, input);
  return {
    ...built,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    status: 'PREVIEW',
  };
}

function invoiceNumberFor(tenantId: string, periodEnd: Date): string {
  const ym = periodEnd.toISOString().slice(0, 7).replace('-', '');
  return `INV-${tenantId.slice(0, 8)}-${ym}-${Date.now().toString().slice(-6)}`;
}

export async function generateInvoice(
  db: BillingDb,
  tenantId: string,
  input: InvoiceBuildInput,
  actorId?: string,
) {
  const idempotencyKey =
    input.idempotencyKey ?? `invoice:${tenantId}:${input.periodStart}:${input.periodEnd}`;

  const [existing] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existing) {
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, existing.id));
    return { invoice: existing, lines, duplicate: true };
  }

  const built = await buildInvoiceLines(db, tenantId, input);
  const periodEnd = new Date(input.periodEnd);

  const [invoice] = await db
    .insert(invoices)
    .values({
      tenantId,
      invoiceNumber: invoiceNumberFor(tenantId, periodEnd),
      status: 'draft',
      subtotal: built.subtotal,
      tax: built.tax,
      total: built.total,
      currency: built.currency,
      periodStart: new Date(input.periodStart),
      periodEnd,
      idempotencyKey,
      creditApplied: built.creditApplied,
      subscriptionId: (await resolveTenantBillingContext(db, tenantId)).sub?.id,
      taxRate: built.taxRate,
      taxInclusive: built.taxInclusive,
      metadata: built.metadata,
    })
    .returning();

  for (const line of built.lines) {
    await db.insert(invoiceLines).values({
      invoiceId: invoice!.id,
      tenantId,
      description: line.description,
      quantity: line.quantity,
      unitAmount: line.unitAmount,
      amount: line.amount,
      meterName: line.meterName,
      usageEventId: line.usageEventId,
      lineType: line.lineType,
      snapshot: line.snapshot,
    });
  }

  if (actorId) {
    await db.insert(auditEvents).values({
      tenantId,
      actorUserId: actorId,
      actorType: 'user',
      action: 'billing.invoice.generated',
      resourceType: 'invoice',
      resourceId: invoice!.id,
      metadata: redactObject({ idempotencyKey }) as Record<string, unknown>,
    });
  }

  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice!.id));
  return { invoice, lines, duplicate: false };
}

export async function finalizeInvoice(db: BillingDb, tenantId: string, invoiceId: string, actorId?: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId)))
    .limit(1);
  if (!invoice) throw notFound('Invoice');
  if (invoice.status === 'finalized' || invoice.status === 'open' || invoice.status === 'paid') {
    return { invoice, alreadyFinalized: true };
  }
  if (invoice.status === 'void') {
    throw validationError({ status: 'Cannot finalize a void invoice' });
  }

  const [updated] = await db
    .update(invoices)
    .set({ status: 'finalized', finalizedAt: new Date(), issuedAt: new Date() })
    .where(eq(invoices.id, invoiceId))
    .returning();

  if (actorId) {
    await db.insert(auditEvents).values({
      tenantId,
      actorUserId: actorId,
      actorType: 'user',
      action: 'billing.invoice.finalized',
      resourceType: 'invoice',
      resourceId: invoiceId,
      metadata: {},
    });
  }

  if (Number(updated!.creditApplied) > 0) {
    const balance = await getCreditBalance(db, tenantId, updated!.currency);
    const newBalance = subDecimal(balance, updated!.creditApplied);
    await db.insert(creditLedger).values({
      tenantId,
      amount: `-${updated!.creditApplied}`,
      currency: updated!.currency,
      balanceAfter: roundMoney(newBalance, 6),
      reason: 'invoice_credit_applied',
      referenceType: 'invoice',
      referenceId: invoiceId,
    });
  }

  return { invoice: updated, alreadyFinalized: false };
}

export async function voidInvoice(db: BillingDb, tenantId: string, invoiceId: string, actorId?: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.tenantId, tenantId), eq(invoices.id, invoiceId)))
    .limit(1);
  if (!invoice) throw notFound('Invoice');
  if (invoice.status === 'paid') {
    throw validationError({ status: 'Paid invoices cannot be voided in this phase' });
  }

  const [updated] = await db
    .update(invoices)
    .set({ status: 'void' })
    .where(eq(invoices.id, invoiceId))
    .returning();

  if (actorId) {
    await db.insert(auditEvents).values({
      tenantId,
      actorUserId: actorId,
      actorType: 'user',
      action: 'billing.invoice.voided',
      resourceType: 'invoice',
      resourceId: invoiceId,
      metadata: {},
    });
  }

  return updated;
}

export async function applyCreditAdjustment(
  db: BillingDb,
  tenantId: string,
  amount: string,
  currency: string,
  reason: string,
  actorId?: string,
) {
  assertCurrencyMatch((await ensureBillingProfile(db, tenantId, currency)).billingCurrency, currency);
  const balance = await getCreditBalance(db, tenantId, currency);
  const newBalance = addDecimal(balance, amount);

  const [entry] = await db
    .insert(creditLedger)
    .values({
      tenantId,
      amount,
      currency,
      balanceAfter: roundMoney(newBalance, 6),
      reason,
    })
    .returning();

  if (actorId) {
    await db.insert(auditEvents).values({
      tenantId,
      actorUserId: actorId,
      actorType: 'user',
      action: 'billing.credit.adjusted',
      resourceType: 'credit_ledger',
      resourceId: entry!.id,
      metadata: redactObject({ amount, reason }) as Record<string, unknown>,
    });
  }

  return entry;
}

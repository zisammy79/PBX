import { validationError } from '@pbx/contracts';
import { createHash } from 'node:crypto';
import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import {
  aiUsage,
  creditLedger,
  planEntitlements,
  plans,
  priceBooks,
  prices,
  ratedUsage,
  subscriptions,
  tenantBillingProfiles,
  usageEvents,
} from '@pbx/database';
import {
  applyBillingIncrement,
  applyMinimumCharge,
  mulDecimal,
  parseDecimal,
} from './money.js';

export type BillingDb = Parameters<
  Parameters<typeof import('@pbx/database').withTenantContext>[2]
>[0];

export const SUPPORTED_METERS = [
  'internal_call_seconds',
  'ai_realtime_session_seconds',
  'ai_input_audio_seconds',
  'ai_output_audio_seconds',
  'ai_tool_calls',
  'recording_seconds',
  'recording_storage_bytes',
  'api_requests',
] as const;

export type RateResult = {
  normalized: number;
  rated: number;
  unrated: number;
  skipped: number;
};

export async function resolveTenantBillingContext(db: BillingDb, tenantId: string) {
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId)).limit(1);
  const [plan] = sub
    ? await db.select().from(plans).where(eq(plans.id, sub.planId)).limit(1)
    : [];
  let bookId = plan?.priceBookId;
  if (!bookId) {
    const [defaultBook] = await db
      .select()
      .from(priceBooks)
      .where(eq(priceBooks.isActive, true))
      .orderBy(desc(priceBooks.effectiveFrom))
      .limit(1);
    bookId = defaultBook?.id;
  }
  const [profile] = await db
    .select()
    .from(tenantBillingProfiles)
    .where(eq(tenantBillingProfiles.tenantId, tenantId))
    .limit(1);
  const entitlements = plan
    ? await db.select().from(planEntitlements).where(eq(planEntitlements.planId, plan.id))
    : [];
  const currency = profile?.billingCurrency ?? plan?.currency ?? 'USD';
  return { sub, plan, bookId, profile, entitlements, currency };
}

export async function resolvePriceForMeter(
  db: BillingDb,
  priceBookId: string,
  meterName: string,
  at: Date,
) {
  const [price] = await db
    .select()
    .from(prices)
    .where(
      and(
        eq(prices.priceBookId, priceBookId),
        eq(prices.meterName, meterName),
        eq(prices.isActive, true),
        lte(prices.effectiveFrom, at),
        or(isNull(prices.effectiveTo), gte(prices.effectiveTo, at)),
      ),
    )
    .orderBy(desc(prices.effectiveFrom))
    .limit(1);
  return price ?? null;
}

export async function normalizeAiUsage(db: BillingDb, tenantId: string): Promise<number> {
  const rows = await db
    .select()
    .from(aiUsage)
    .where(eq(aiUsage.tenantId, tenantId))
    .orderBy(desc(aiUsage.recordedAt))
    .limit(500);

  let created = 0;
  for (const row of rows) {
    const idempotencyKey = `ai-usage:${row.id}`;
    const [existing] = await db
      .select({ id: usageEvents.id })
      .from(usageEvents)
      .where(eq(usageEvents.idempotencyKey, idempotencyKey))
      .limit(1);
    if (existing) continue;

    const integrityHash = createHash('sha256')
      .update(`${tenantId}:${row.meterName}:${row.quantity}:${row.recordedAt.toISOString()}`)
      .digest('hex');

    await db.insert(usageEvents).values({
      idempotencyKey,
      tenantId,
      callId: row.callId ?? undefined,
      provider: row.provider,
      resourceType: 'ai',
      meterName: row.meterName,
      quantity: row.quantity,
      unit: row.unit,
      eventTimestamp: row.recordedAt,
      source: row.measurementSource,
      correlationId: row.correlationId ?? undefined,
      integrityHash,
      dimensions: { sessionId: row.sessionId, origin: 'ai_usage', measurementOrigin: 'PLATFORM_MEASURED' },
      costMetadata: { providerCostStatus: 'UNAVAILABLE' },
    });
    created += 1;
  }
  return created;
}

export async function rateUsageEvents(
  db: BillingDb,
  tenantId: string,
  options?: { reprocessUnrated?: boolean },
): Promise<RateResult> {
  const ctx = await resolveTenantBillingContext(db, tenantId);
  if (!ctx.bookId) {
    return { normalized: 0, rated: 0, unrated: 0, skipped: 0 };
  }

  const events = await db
    .select()
    .from(usageEvents)
    .where(eq(usageEvents.tenantId, tenantId))
    .orderBy(desc(usageEvents.eventTimestamp))
    .limit(500);

  let rated = 0;
  let unrated = 0;
  let skipped = 0;

  for (const event of events) {
    const [existingRated] = await db
      .select()
      .from(ratedUsage)
      .where(eq(ratedUsage.usageEventId, event.id))
      .limit(1);
    if (existingRated && existingRated.ratingStatus === 'rated' && !options?.reprocessUnrated) {
      skipped += 1;
      continue;
    }

    const price = await resolvePriceForMeter(db, ctx.bookId, event.meterName, event.eventTimestamp);
    if (!price) {
      if (existingRated) {
        await db
          .update(ratedUsage)
          .set({
            ratingStatus: 'unrated',
            reconciliationStatus: 'missing_price',
            customerCharge: '0',
            providerCostStatus: 'UNAVAILABLE',
            priceSnapshot: { meterName: event.meterName, reason: 'missing_price' },
          })
          .where(eq(ratedUsage.id, existingRated.id));
      } else {
        await db.insert(ratedUsage).values({
          usageEventId: event.id,
          tenantId,
          priceId: null,
          providerCost: null,
          customerCharge: '0',
          currency: ctx.currency,
          reconciliationStatus: 'missing_price',
          providerCostStatus: 'UNAVAILABLE',
          ratingStatus: 'unrated',
          priceSnapshot: { meterName: event.meterName, reason: 'missing_price' },
        });
      }
      unrated += 1;
      continue;
    }

    if (price.pricingModel !== 'PER_UNIT' && price.pricingModel !== 'FLAT') {
      if (!existingRated) {
        await db.insert(ratedUsage).values({
          usageEventId: event.id,
          tenantId,
          priceId: price.id,
          providerCost: null,
          customerCharge: '0',
          currency: ctx.currency,
          reconciliationStatus: 'unsupported_pricing_model',
          providerCostStatus: 'UNAVAILABLE',
          ratingStatus: 'unrated',
          priceSnapshot: { pricingModel: price.pricingModel, reason: 'unsupported_pricing_model' },
        });
      }
      unrated += 1;
      continue;
    }

    const billableQty = applyBillingIncrement(String(event.quantity), price.billingIncrement);
    let charge = mulDecimal(price.unitAmount, billableQty);
    if (price.pricingModel === 'FLAT') {
      charge = parseDecimal(price.unitAmount);
    }
    charge = applyMinimumCharge(charge, price.minimumCharge);

    const snapshot = {
      priceId: price.id,
      meterName: price.meterName,
      unitAmount: price.unitAmount,
      pricingModel: price.pricingModel,
      effectiveFrom: price.effectiveFrom.toISOString(),
      ratedAt: new Date().toISOString(),
    };

    if (existingRated) {
      await db
        .update(ratedUsage)
        .set({
          priceId: price.id,
          customerCharge: charge,
          currency: ctx.currency,
          reconciliationStatus: 'rated',
          providerCostStatus: 'UNAVAILABLE',
          ratingStatus: 'rated',
          priceSnapshot: snapshot,
          ratedAt: new Date(),
        })
        .where(eq(ratedUsage.id, existingRated.id));
    } else {
      await db.insert(ratedUsage).values({
        usageEventId: event.id,
        tenantId,
        priceId: price.id,
        providerCost: null,
        customerCharge: charge,
        currency: ctx.currency,
        reconciliationStatus: 'rated',
        providerCostStatus: 'UNAVAILABLE',
        ratingStatus: 'rated',
        priceSnapshot: snapshot,
      });
    }
    rated += 1;
  }

  return { normalized: 0, rated, unrated, skipped };
}

export async function runRatingPipeline(db: BillingDb, tenantId: string): Promise<RateResult> {
  const normalized = await normalizeAiUsage(db, tenantId);
  const result = await rateUsageEvents(db, tenantId);
  return { ...result, normalized };
}

export function assertCurrencyMatch(expected: string, actual: string) {
  if (expected.toUpperCase() !== actual.toUpperCase()) {
    throw validationError({
      currency: `Currency mismatch: expected ${expected}, got ${actual}`,
    });
  }
}

export async function getCreditBalance(db: BillingDb, tenantId: string, currency: string): Promise<string> {
  const [latest] = await db
    .select()
    .from(creditLedger)
    .where(and(eq(creditLedger.tenantId, tenantId), eq(creditLedger.currency, currency)))
    .orderBy(desc(creditLedger.createdAt))
    .limit(1);
  return latest?.balanceAfter ?? '0';
}

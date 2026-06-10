import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { invoiceStatusEnum, subscriptionStatusEnum } from './enums';
import { tenants } from './tenants';

export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    customerId: uuid('customer_id'),
    callId: uuid('call_id'),
    provider: varchar('provider', { length: 64 }),
    providerAccount: varchar('provider_account', { length: 128 }),
    resourceType: varchar('resource_type', { length: 64 }).notNull(),
    meterName: varchar('meter_name', { length: 64 }).notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 6 }).notNull(),
    unit: varchar('unit', { length: 32 }).notNull(),
    eventStart: timestamp('event_start', { withTimezone: true }),
    eventEnd: timestamp('event_end', { withTimezone: true }),
    eventTimestamp: timestamp('event_timestamp', { withTimezone: true }).notNull(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
    source: varchar('source', { length: 64 }).notNull(),
    dimensions: jsonb('dimensions').notNull().default({}),
    costMetadata: jsonb('cost_metadata').notNull().default({}),
    correlationId: uuid('correlation_id'),
    integrityHash: varchar('integrity_hash', { length: 64 }).notNull(),
  },
  (table) => [
    uniqueIndex('usage_events_idempotency_uidx').on(table.idempotencyKey),
    index('usage_events_tenant_idx').on(table.tenantId),
    index('usage_events_call_idx').on(table.callId),
    index('usage_events_timestamp_idx').on(table.eventTimestamp),
  ],
);

export const ratedUsage = pgTable(
  'rated_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usageEventId: uuid('usage_event_id')
      .notNull()
      .references(() => usageEvents.id),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    priceId: uuid('price_id'),
    providerCost: numeric('provider_cost', { precision: 18, scale: 6 }),
    customerCharge: numeric('customer_charge', { precision: 18, scale: 6 }).notNull(),
    markup: numeric('markup', { precision: 18, scale: 6 }),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    ratedAt: timestamp('rated_at', { withTimezone: true }).notNull().defaultNow(),
    reconciliationStatus: varchar('reconciliation_status', { length: 32 })
      .notNull()
      .default('pending'),
    providerCostStatus: varchar('provider_cost_status', { length: 32 })
      .notNull()
      .default('UNAVAILABLE'),
    ratingStatus: varchar('rating_status', { length: 32 }).notNull().default('rated'),
    priceSnapshot: jsonb('price_snapshot').notNull().default({}),
  },
  (table) => [
    index('rated_usage_tenant_idx').on(table.tenantId),
    index('rated_usage_event_idx').on(table.usageEventId),
    uniqueIndex('rated_usage_event_uidx').on(table.usageEventId),
  ],
);

export const priceBooks = pgTable('price_books', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull(),
  effectiveTo: timestamp('effective_to', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const prices = pgTable(
  'prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    priceBookId: uuid('price_book_id')
      .notNull()
      .references(() => priceBooks.id, { onDelete: 'cascade' }),
    meterName: varchar('meter_name', { length: 64 }).notNull(),
    unitAmount: numeric('unit_amount', { precision: 18, scale: 6 }).notNull(),
    unit: varchar('unit', { length: 32 }).notNull(),
    billingIncrement: numeric('billing_increment', { precision: 18, scale: 6 }),
    minimumCharge: numeric('minimum_charge', { precision: 18, scale: 6 }),
    pricingModel: varchar('pricing_model', { length: 32 }).notNull().default('PER_UNIT'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('prices_book_meter_idx').on(table.priceBookId, table.meterName)],
);

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 63 }).notNull().unique(),
  priceBookId: uuid('price_book_id').references(() => priceBooks.id),
  monthlyAmount: numeric('monthly_amount', { precision: 18, scale: 2 }),
  currency: varchar('currency', { length: 3 }).notNull().default('USD'),
  isPublic: boolean('is_public').notNull().default(true),
  trialDays: integer('trial_days').default(14),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const planEntitlements = pgTable(
  'plan_entitlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    meterName: varchar('meter_name', { length: 64 }).notNull(),
    includedQuantity: numeric('included_quantity', { precision: 18, scale: 6 }).notNull(),
    unit: varchar('unit', { length: 32 }).notNull(),
  },
  (table) => [uniqueIndex('plan_entitlements_uidx').on(table.planId, table.meterName)],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatusEnum('status').notNull().default('trialing'),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 128 }),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('subscriptions_tenant_idx').on(table.tenantId)],
);

export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    amount: numeric('amount', { precision: 18, scale: 6 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    balanceAfter: numeric('balance_after', { precision: 18, scale: 6 }).notNull(),
    reason: varchar('reason', { length: 128 }).notNull(),
    referenceType: varchar('reference_type', { length: 64 }),
    referenceId: uuid('reference_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('credit_ledger_tenant_idx').on(table.tenantId)],
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    invoiceNumber: varchar('invoice_number', { length: 32 }).notNull().unique(),
    status: invoiceStatusEnum('status').notNull().default('draft'),
    subtotal: numeric('subtotal', { precision: 18, scale: 2 }).notNull(),
    tax: numeric('tax', { precision: 18, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 18, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),
    stripeInvoiceId: varchar('stripe_invoice_id', { length: 128 }),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    dueAt: timestamp('due_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    creditApplied: numeric('credit_applied', { precision: 18, scale: 2 }).notNull().default('0'),
    subscriptionId: uuid('subscription_id'),
    taxRate: numeric('tax_rate', { precision: 8, scale: 6 }),
    taxInclusive: boolean('tax_inclusive').notNull().default(false),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('invoices_tenant_idx').on(table.tenantId),
    uniqueIndex('invoices_idempotency_uidx').on(table.idempotencyKey),
  ],
);

export const invoiceLines = pgTable(
  'invoice_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    description: text('description').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 6 }).notNull(),
    unitAmount: numeric('unit_amount', { precision: 18, scale: 6 }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    meterName: varchar('meter_name', { length: 64 }),
    usageEventId: uuid('usage_event_id'),
    lineType: varchar('line_type', { length: 32 }).notNull().default('usage'),
    snapshot: jsonb('snapshot').notNull().default({}),
  },
  (table) => [index('invoice_lines_invoice_idx').on(table.invoiceId)],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    invoiceId: uuid('invoice_id').references(() => invoices.id),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    provider: varchar('provider', { length: 32 }).notNull().default('stripe'),
    providerPaymentId: varchar('provider_payment_id', { length: 128 }),
    status: varchar('status', { length: 32 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('payments_tenant_idx').on(table.tenantId)],
);

export const tenantBillingProfiles = pgTable('tenant_billing_profiles', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  billingCurrency: varchar('billing_currency', { length: 3 }).notNull().default('USD'),
  taxRate: numeric('tax_rate', { precision: 8, scale: 6 }).notNull().default('0.200000'),
  taxInclusive: boolean('tax_inclusive').notNull().default(false),
  taxEffectiveFrom: timestamp('tax_effective_from', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

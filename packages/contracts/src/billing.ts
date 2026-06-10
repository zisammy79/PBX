import { z } from 'zod';

export const PricingModelSchema = z.enum(['FLAT', 'PER_UNIT', 'TIERED', 'VOLUME']);

export const PlanEntitlementSchema = z.object({
  meterName: z.string().min(1).max(64),
  includedQuantity: z.string(),
  unit: z.string().min(1).max(32),
});

export const CreatePlanSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().regex(/^[a-z0-9-]{2,63}$/),
  priceBookId: z.string().uuid().optional(),
  monthlyAmount: z.string().optional(),
  currency: z.string().length(3).default('USD'),
  trialDays: z.number().int().min(0).max(90).default(14),
  isPublic: z.boolean().default(true),
  entitlements: z.array(PlanEntitlementSchema).optional(),
});

export const UpdatePlanSchema = CreatePlanSchema.partial();

export const CreatePriceSchema = z.object({
  priceBookId: z.string().uuid(),
  meterName: z.string().min(1).max(64),
  unitAmount: z.string(),
  unit: z.string().min(1).max(32),
  billingIncrement: z.string().optional(),
  minimumCharge: z.string().optional(),
  pricingModel: PricingModelSchema.default('PER_UNIT'),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});

export const UpdatePriceSchema = CreatePriceSchema.partial().omit({ priceBookId: true });

export const InvoicePreviewSchema = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  currency: z.string().length(3).default('USD'),
});

export const InvoiceGenerateSchema = InvoicePreviewSchema.extend({
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const CreditAdjustmentSchema = z.object({
  amount: z.string(),
  currency: z.string().length(3).default('USD'),
  reason: z.string().min(1).max(128),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

export const UsageListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export type CreatePlan = z.infer<typeof CreatePlanSchema>;
export type UpdatePlan = z.infer<typeof UpdatePlanSchema>;
export type CreatePrice = z.infer<typeof CreatePriceSchema>;
export type UpdatePrice = z.infer<typeof UpdatePriceSchema>;
export type InvoicePreviewRequest = z.infer<typeof InvoicePreviewSchema>;
export type InvoiceGenerateRequest = z.infer<typeof InvoiceGenerateSchema>;
export type CreditAdjustmentRequest = z.infer<typeof CreditAdjustmentSchema>;

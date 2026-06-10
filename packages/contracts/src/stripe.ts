import { z } from 'zod';

export const StripeModeSchema = z.enum(['DISABLED', 'TEST', 'LIVE']);

export const StripeConnectSchema = z.object({
  secretKey: z.string().min(1),
  publishableKey: z.string().min(1),
  webhookSecret: z.string().min(1),
});

export const StripeTestPaymentSchema = z.object({
  invoiceId: z.string().uuid().optional(),
  simulateFailure: z.boolean().default(false),
});

export type StripeConnect = z.infer<typeof StripeConnectSchema>;

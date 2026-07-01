import { z } from 'zod';

export const SipDomainModeSchema = z.enum(['shared', 'tenant_domain']);
export const SipDomainValidationStatusSchema = z.enum([
  'pending',
  'validating',
  'verified',
  'failed',
  'disabled',
]);
export const SipDomainActivationStatusSchema = z.enum(['inactive', 'active', 'disabled']);

export type SipDomainMode = z.infer<typeof SipDomainModeSchema>;

export const RequestTenantSipDomainSchema = z.object({
  domain: z
    .string()
    .min(3)
    .max(255)
    .regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i),
  mode: SipDomainModeSchema.default('tenant_domain'),
});

export type RequestTenantSipDomainRequest = z.infer<typeof RequestTenantSipDomainSchema>;

export const TenantSipDomainSummarySchema = z.object({
  id: z.string().uuid(),
  domain: z.string(),
  mode: SipDomainModeSchema,
  validationStatus: SipDomainValidationStatusSchema,
  activationStatus: SipDomainActivationStatusSchema,
  sharedDomainFallback: z.boolean(),
  dnsInstructions: z.object({
    recordType: z.literal('TXT'),
    host: z.string(),
    value: z.string(),
  }).nullable(),
  validatedAt: z.string().datetime().nullable(),
  activatedAt: z.string().datetime().nullable(),
  lastCheckedAt: z.string().datetime().nullable(),
  failureReason: z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type TenantSipDomainSummary = z.infer<typeof TenantSipDomainSummarySchema>;

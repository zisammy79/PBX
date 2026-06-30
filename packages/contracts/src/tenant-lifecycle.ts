import { z } from 'zod';

export const TenantLifecycleStatusSchema = z.enum([
  'draft',
  'provisioning',
  'active',
  'suspended',
  'failed',
  'archived',
]);

export type TenantLifecycleStatus = z.infer<typeof TenantLifecycleStatusSchema>;

export const ALLOWED_LIFECYCLE_TRANSITIONS: Record<
  TenantLifecycleStatus,
  readonly TenantLifecycleStatus[]
> = {
  draft: ['provisioning', 'archived'],
  provisioning: ['active', 'failed'],
  active: ['suspended', 'archived'],
  suspended: ['active', 'archived'],
  failed: ['provisioning', 'archived'],
  archived: [],
};

export const UpdateTenantLifecycleSchema = z.object({
  status: TenantLifecycleStatusSchema,
  reason: z.string().min(1).max(500).optional(),
});

export type UpdateTenantLifecycleRequest = z.infer<typeof UpdateTenantLifecycleSchema>;

export const ProvisionTenantRequestSchema = z.object({
  planId: z.string().uuid().optional(),
  ownerEmail: z.string().email().optional(),
  ownerDisplayName: z.string().min(1).max(255).optional(),
  initialExtensions: z
    .array(
      z.object({
        extensionNumber: z.string().regex(/^\d{3,6}$/),
        displayName: z.string().min(1).max(255),
      }),
    )
    .max(10)
    .optional(),
  /** When true and Twilio is configured, provisions an IL local DID during tenant activation. */
  assignPhoneNumber: z.boolean().optional(),
  inboundDestinationExtensionNumber: z.string().regex(/^\d{3,6}$/).optional(),
});

export type ProvisionTenantRequest = z.infer<typeof ProvisionTenantRequestSchema>;

export const TenantProvisioningStateSchema = z.object({
  step: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']),
  failureReason: z.string().nullable(),
  updatedAt: z.string().datetime(),
});

export type TenantProvisioningState = z.infer<typeof TenantProvisioningStateSchema>;

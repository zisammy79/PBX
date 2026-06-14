import { z } from 'zod';

export const PlatformCustomerSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
  planId: z.string().uuid().nullable(),
  sipDomain: z.string().nullable(),
  recordCallsByDefault: z.boolean(),
  activeUsers: z.number().int().nonnegative(),
  activeExtensions: z.number().int().nonnegative(),
  onlineRegistrations: z.number().int().nonnegative(),
  concurrentCalls: z.number().int().nonnegative(),
  lastActivityAt: z.string().datetime().nullable(),
  health: z.enum(['healthy', 'degraded', 'unknown']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type PlatformCustomerSummary = z.infer<typeof PlatformCustomerSummarySchema>;

export const UpdateTenantLifecycleSchema = z.object({
  status: z.enum(['active', 'suspended', 'archived', 'provisioning']),
});

export type UpdateTenantLifecycleRequest = z.infer<typeof UpdateTenantLifecycleSchema>;

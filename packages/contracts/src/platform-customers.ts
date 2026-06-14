import { z } from 'zod';
import { TenantLifecycleStatusSchema } from './tenant-lifecycle.js';

export const PlatformCustomerSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  status: TenantLifecycleStatusSchema,
  planId: z.string().uuid().nullable(),
  primaryOwnerEmail: z.string().email().nullable(),
  sipDomain: z.string().nullable(),
  sipDomainMode: z.enum(['shared', 'tenant_domain']).nullable(),
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

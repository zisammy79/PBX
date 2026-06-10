import { z } from 'zod';

export const TenantStatusSchema = z.enum([
  'provisioning',
  'active',
  'suspended',
  'trial',
  'closed',
]);

export type TenantStatus = z.infer<typeof TenantStatusSchema>;

export const TenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  status: TenantStatusSchema,
  asteriskContext: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Tenant = z.infer<typeof TenantSchema>;

/** Active tenant is always derived from auth — never from client-supplied IDs alone. */
export interface TenantContext {
  tenantId: string;
  tenantSlug: string;
  asteriskContext: string;
  isSupportSession: boolean;
  supportAuditId?: string;
}

export const TenantMembershipSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  roles: z.array(z.string()),
  createdAt: z.string().datetime(),
});

export type TenantMembership = z.infer<typeof TenantMembershipSchema>;

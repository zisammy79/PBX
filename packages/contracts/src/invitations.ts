import { z } from 'zod';
import { TenantRoleSchema } from './auth.js';

export const MembershipStatusSchema = z.enum([
  'invited',
  'active',
  'suspended',
  'revoked',
  'expired',
]);

export type MembershipStatus = z.infer<typeof MembershipStatusSchema>;

export const InviteTenantUserSchema = z.object({
  email: z.string().email(),
  role: TenantRoleSchema,
  displayName: z.string().min(1).max(255).optional(),
});

export type InviteTenantUserRequest = z.infer<typeof InviteTenantUserSchema>;

export const AcceptInvitationSchema = z.object({
  token: z.string().min(16),
  password: z.string().min(12).optional(),
  displayName: z.string().min(1).max(255).optional(),
});

export type AcceptInvitationRequest = z.infer<typeof AcceptInvitationSchema>;

export const UpdateMembershipSchema = z.object({
  role: TenantRoleSchema.optional(),
  status: MembershipStatusSchema.optional(),
});

export type UpdateMembershipRequest = z.infer<typeof UpdateMembershipSchema>;

export const TenantUserSummarySchema = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string(),
  roles: z.array(TenantRoleSchema),
  membershipStatus: MembershipStatusSchema,
  invitationStatus: z.enum(['none', 'pending', 'accepted', 'revoked', 'expired']).nullable(),
  assignedExtensions: z.array(
    z.object({
      id: z.string().uuid(),
      extensionNumber: z.string(),
      displayName: z.string(),
    }),
  ),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

export type TenantUserSummary = z.infer<typeof TenantUserSummarySchema>;

export const TenantInvitationSummarySchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: TenantRoleSchema,
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
  deliveryStatus: z.enum(['delivery_pending', 'provider_not_configured', 'sent', 'failed']),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export type TenantInvitationSummary = z.infer<typeof TenantInvitationSummarySchema>;

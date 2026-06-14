import { z } from 'zod';

export const PlatformRoleSchema = z.enum([
  'platform_super_admin',
  'platform_support_operator',
]);

export const TenantRoleSchema = z.enum([
  'tenant_owner',
  'tenant_administrator',
  'tenant_billing_administrator',
  'supervisor',
  'human_agent',
  'read_only_auditor',
  'api_service_account',
]);

export const RoleSchema = z.union([PlatformRoleSchema, TenantRoleSchema]);

export type PlatformRole = z.infer<typeof PlatformRoleSchema>;
export type TenantRole = z.infer<typeof TenantRoleSchema>;
export type Role = z.infer<typeof RoleSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  totpCode: z.string().length(6).optional(),
});

export const TokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
  tokenType: z.literal('Bearer'),
});

export const JwtClaimsSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
  type: z.enum(['access', 'refresh']),
  platformRoles: z.array(PlatformRoleSchema).default([]),
  tenantMemberships: z
    .array(
      z.object({
        tenantId: z.string().uuid(),
        roles: z.array(TenantRoleSchema),
      }),
    )
    .default([]),
  supportSession: z
    .object({
      tenantId: z.string().uuid(),
      expiresAt: z.string().datetime(),
      auditId: z.string().uuid(),
    })
    .optional(),
  sessionId: z.string().uuid(),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
export type JwtClaims = z.infer<typeof JwtClaimsSchema>;

export const CreateTenantRequestSchema = z.object({
  name: z.string().min(2).max(255),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
  ownerEmail: z.string().email(),
  ownerDisplayName: z.string().min(1).max(255),
  planId: z.string().uuid().optional(),
});

export type CreateTenantRequest = z.infer<typeof CreateTenantRequestSchema>;

export const CreateExtensionRequestSchema = z.object({
  extensionNumber: z.string().regex(/^\d{3,6}$/),
  displayName: z.string().min(1).max(255),
});

export type CreateExtensionRequest = z.infer<typeof CreateExtensionRequestSchema>;

export const ExtensionProvisioningStatusSchema = z.enum([
  'pending',
  'provisioning',
  'ready',
  'failed',
  'deleting',
  'deleted',
]);

export type ExtensionProvisioningStatus = z.infer<typeof ExtensionProvisioningStatusSchema>;

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(12),
});

export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

export const LoginResponseSchema = TokenResponseSchema.extend({
  mustChangePassword: z.boolean().default(false),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    platformRoles: z.array(PlatformRoleSchema),
    tenantMemberships: z.array(
      z.object({
        tenantId: z.string().uuid(),
        roles: z.array(TenantRoleSchema),
      }),
    ),
  }),
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

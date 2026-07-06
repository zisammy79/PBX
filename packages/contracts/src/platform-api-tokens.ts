import { z } from 'zod';

export const PlatformApiTokenRoleSchema = z.enum(['platform_super_admin']);

export const CreatePlatformApiTokenSchema = z.object({
  name: z.string().min(1).max(255),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const RotatePlatformApiTokenSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const PlatformApiTokenSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  tokenPrefix: z.string(),
  status: z.string(),
  role: PlatformApiTokenRoleSchema,
  scopes: z.array(z.string()),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime().nullable(),
});

export const PlatformApiTokenCreatedSchema = PlatformApiTokenSummarySchema.extend({
  token: z.string(),
});

export type CreatePlatformApiToken = z.infer<typeof CreatePlatformApiTokenSchema>;
export type RotatePlatformApiToken = z.infer<typeof RotatePlatformApiTokenSchema>;
export type PlatformApiTokenSummary = z.infer<typeof PlatformApiTokenSummarySchema>;

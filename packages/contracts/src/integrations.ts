import { z } from 'zod';

export const IntegrationTypeSchema = z.enum([
  'ai',
  'sip_carrier',
  'stripe',
  'email',
  'sms',
  'object_storage',
  'monitoring',
  'crm',
  'http',
]);

export const IntegrationScopeSchema = z.enum(['platform', 'tenant']);
export const IntegrationEnvironmentSchema = z.enum(['default', 'test', 'live']);

export const IntegrationValidationStatusSchema = z.enum([
  'NOT_CONFIGURED',
  'CONFIGURED_NOT_TESTED',
  'VALID',
  'INVALID',
  'DISABLED',
  'ROTATION_REQUIRED',
]);

export const AiIntegrationProviderSchema = z.enum([
  'openai',
  'gemini',
  'azure_openai',
  'anthropic',
  'custom',
]);

export const CreateIntegrationSchema = z.object({
  integrationType: IntegrationTypeSchema,
  provider: z.string().min(1).max(64),
  scopeType: IntegrationScopeSchema.default('platform'),
  scopeId: z.string().uuid().optional(),
  environment: IntegrationEnvironmentSchema.default('default'),
  displayName: z.string().min(1).max(255),
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  config: z.record(z.unknown()).default({}),
  credentials: z.record(z.unknown()).optional(),
});

export const UpdateIntegrationSchema = z.object({
  displayName: z.string().min(1).max(255).optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
  credentials: z.record(z.unknown()).optional(),
});

export const ReplaceIntegrationCredentialSchema = z.object({
  credentials: z.record(z.unknown()),
  confirmReplace: z.literal(true),
});

export const CreateIntegrationAssignmentSchema = z.object({
  tenantId: z.string().uuid(),
  enabled: z.boolean().default(true),
});

export type CreateIntegration = z.infer<typeof CreateIntegrationSchema>;
export type UpdateIntegration = z.infer<typeof UpdateIntegrationSchema>;
export type ReplaceIntegrationCredential = z.infer<typeof ReplaceIntegrationCredentialSchema>;
export type CreateIntegrationAssignment = z.infer<typeof CreateIntegrationAssignmentSchema>;

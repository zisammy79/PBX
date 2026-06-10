import { z } from 'zod';

export const AiProviderTypeSchema = z.enum([
  'openai',
  'gemini',
  'azure_openai',
  'anthropic',
  'custom',
  'deterministic-test',
]);

export const ExternalValidationStatusSchema = z.enum(['NOT_TESTED', 'DEFERRED']);

export const AiToolNameSchema = z.enum(['transfer_call', 'end_call', 'http_webhook']);

export const BargeInConfigSchema = z.object({
  enabled: z.boolean().default(true),
  thresholdMs: z.number().int().min(0).max(5000).optional(),
});

export const CreateAiProviderConnectionSchema = z.object({
  providerType: AiProviderTypeSchema,
  name: z.string().min(1).max(255),
  credentials: z.record(z.unknown()),
  config: z.record(z.unknown()).optional(),
});

export const UpdateAiProviderConnectionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
  credentials: z.record(z.unknown()).optional(),
});

export const CreateAiAgentSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(4000).optional(),
  routeNumber: z.string().regex(/^[0-9]{3,6}$/),
  transferExtensionId: z.string().uuid(),
  transferDestinationAliases: z.record(z.string().min(1).max(32)).default({}),
  providerConnectionId: z.string().uuid(),
  provider: AiProviderTypeSchema,
  model: z.string().min(1).max(128),
  voice: z.string().max(64).optional(),
  language: z.string().max(16).default('en'),
  systemInstructions: z.string().max(32000).optional(),
  openingMessage: z.string().max(4000).optional(),
  silenceTimeoutSeconds: z.number().int().min(1).max(300).optional(),
  maxDurationSeconds: z.number().int().min(30).max(7200).optional(),
  bargeIn: BargeInConfigSchema.optional(),
  allowedTools: z.array(AiToolNameSchema).default([]),
  recordingPolicy: z.enum(['none', 'metadata', 'full']).default('none'),
  transcriptionPolicy: z.enum(['none', 'metadata', 'full']).default('metadata'),
});

export const UpdateAiAgentSchema = CreateAiAgentSchema.partial().omit({ routeNumber: true });

export type CreateAiProviderConnection = z.infer<typeof CreateAiProviderConnectionSchema>;
export type UpdateAiProviderConnection = z.infer<typeof UpdateAiProviderConnectionSchema>;
export type CreateAiAgent = z.infer<typeof CreateAiAgentSchema>;
export type UpdateAiAgent = z.infer<typeof UpdateAiAgentSchema>;

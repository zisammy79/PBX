import { z } from 'zod';
import { AiToolNameSchema } from './ai.js';

export const HttpWebhookToolConfigSchema = z.object({
  allowedHosts: z.array(z.string().min(1)).min(1),
  url: z.string().url().optional(),
  method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
  timeoutMs: z.number().int().min(1000).max(30000).default(5000),
  maxResponseBytes: z.number().int().min(256).max(65536).default(8192),
});

export const CreateAiToolSchema = z.object({
  name: AiToolNameSchema,
  jsonSchema: z.record(z.unknown()).default({}),
  config: z.record(z.unknown()).default({}),
  requiresApproval: z.boolean().default(false),
});

export const UpdateAiToolSchema = CreateAiToolSchema.partial();

export const AiSessionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  callId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  state: z.string().max(32).optional(),
});

export const AiUsageListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  callId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  meterName: z.string().max(64).optional(),
});

export type CreateAiTool = z.infer<typeof CreateAiToolSchema>;
export type UpdateAiTool = z.infer<typeof UpdateAiToolSchema>;

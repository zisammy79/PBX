import { z } from 'zod';

export const HealthStatusSchema = z.enum(['healthy', 'degraded', 'unhealthy']);

export const DependencyHealthSchema = z.object({
  name: z.string(),
  status: HealthStatusSchema,
  latencyMs: z.number().optional(),
  message: z.string().optional(),
});

export const HealthResponseSchema = z.object({
  status: HealthStatusSchema,
  version: z.string(),
  timestamp: z.string().datetime(),
  dependencies: z.array(DependencyHealthSchema),
});

export type HealthStatus = z.infer<typeof HealthStatusSchema>;
export type DependencyHealth = z.infer<typeof DependencyHealthSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const ReadinessResponseSchema = HealthResponseSchema.extend({
  ready: z.boolean(),
});

export type ReadinessResponse = z.infer<typeof ReadinessResponseSchema>;

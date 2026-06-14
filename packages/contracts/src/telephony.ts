import { z } from 'zod';

export const ExtensionRegistrationStatusSchema = z.enum(['online', 'offline', 'unknown']);

export type ExtensionRegistrationStatus = z.infer<typeof ExtensionRegistrationStatusSchema>;

export const ExtensionRegistrationRuntimeSchema = z.object({
  extensionId: z.string().uuid(),
  extensionNumber: z.string(),
  registrationStatus: ExtensionRegistrationStatusSchema,
  endpointState: z.string().nullable(),
  contactCount: z.number().int().nonnegative(),
  lastObservedAt: z.string().datetime(),
});

export type ExtensionRegistrationRuntime = z.infer<typeof ExtensionRegistrationRuntimeSchema>;

export const ExtensionRegistrationBatchSchema = z.object({
  items: z.array(ExtensionRegistrationRuntimeSchema),
  observedAt: z.string().datetime(),
  asteriskReachable: z.boolean(),
});

export type ExtensionRegistrationBatch = z.infer<typeof ExtensionRegistrationBatchSchema>;

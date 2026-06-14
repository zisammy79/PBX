import { z } from 'zod';

export const EntitlementDimensionSchema = z.enum([
  'max_active_portal_users',
  'max_active_extensions',
  'max_sip_devices',
  'max_devices_per_extension',
  'max_concurrent_calls',
  'max_phone_numbers',
  'max_ring_groups',
  'max_queues',
  'max_ivrs',
  'recording_enabled',
  'recording_storage_bytes',
  'recording_retention_days',
  'ai_enabled',
  'ai_session_minutes',
  'pstn_enabled',
  'pstn_minutes',
  'max_api_applications',
  'max_webhooks',
]);

export type EntitlementDimension = z.infer<typeof EntitlementDimensionSchema>;

export const EntitlementUsageSchema = z.object({
  dimension: EntitlementDimensionSchema,
  used: z.number(),
  limit: z.number().nullable(),
  remaining: z.number().nullable(),
  overLimit: z.boolean(),
  grandfathered: z.boolean(),
});

export type EntitlementUsage = z.infer<typeof EntitlementUsageSchema>;

export const EntitlementLimitReachedDetailsSchema = z.object({
  code: z.literal('ENTITLEMENT_LIMIT_REACHED'),
  dimension: EntitlementDimensionSchema,
  used: z.number(),
  limit: z.number(),
});

export type EntitlementLimitReachedDetails = z.infer<
  typeof EntitlementLimitReachedDetailsSchema
>;

/** Maps plan_entitlements.meter_name to entitlement dimensions. */
export const METER_TO_DIMENSION: Record<string, EntitlementDimension> = {
  max_active_extensions: 'max_active_extensions',
  max_active_portal_users: 'max_active_portal_users',
  max_sip_devices: 'max_sip_devices',
  max_devices_per_extension: 'max_devices_per_extension',
  max_concurrent_calls: 'max_concurrent_calls',
  max_phone_numbers: 'max_phone_numbers',
  max_ring_groups: 'max_ring_groups',
  max_queues: 'max_queues',
  max_ivrs: 'max_ivrs',
  max_api_applications: 'max_api_applications',
  max_webhooks: 'max_webhooks',
};

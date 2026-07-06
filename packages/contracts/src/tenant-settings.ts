import { z } from 'zod';

export const TenantPhoneNumbersFeatureSettingsSchema = z.object({
  twilioSearch: z.boolean(),
  twilioPurchase: z.boolean(),
  twilioAssign: z.boolean(),
  allowedRoutingTargets: z.array(
    z.enum(['extension', 'ai_agent', 'voicemail', 'reserve_only']),
  ),
});

export type TenantPhoneNumbersFeatureSettings = z.infer<
  typeof TenantPhoneNumbersFeatureSettingsSchema
>;

export const TenantCallsFeatureSettingsSchema = z.object({
  showInbound: z.boolean(),
  showOutbound: z.boolean(),
  recordInbound: z.boolean(),
  recordOutbound: z.boolean(),
});

export type TenantCallsFeatureSettings = z.infer<typeof TenantCallsFeatureSettingsSchema>;

export const TenantTelephonyFeatureSettingsSchema = z.object({
  recording: z.object({
    recordCallsByDefault: z.boolean(),
  }),
});

export type TenantTelephonyFeatureSettings = z.infer<
  typeof TenantTelephonyFeatureSettingsSchema
>;

export const TenantFeatureSettingsSchema = z.object({
  telephony: TenantTelephonyFeatureSettingsSchema,
  phoneNumbers: TenantPhoneNumbersFeatureSettingsSchema,
  calls: TenantCallsFeatureSettingsSchema,
});

export type TenantFeatureSettings = z.infer<typeof TenantFeatureSettingsSchema>;

export const UpdateTenantFeatureSettingsSchema = z
  .object({
    telephony: TenantTelephonyFeatureSettingsSchema.partial().optional(),
    phoneNumbers: TenantPhoneNumbersFeatureSettingsSchema.partial().optional(),
    calls: TenantCallsFeatureSettingsSchema.partial().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one settings section is required',
  });

export type UpdateTenantFeatureSettings = z.infer<typeof UpdateTenantFeatureSettingsSchema>;

export const DEFAULT_TENANT_PHONE_NUMBERS_FEATURES: TenantPhoneNumbersFeatureSettings = {
  twilioSearch: true,
  twilioPurchase: true,
  twilioAssign: true,
  allowedRoutingTargets: ['extension', 'ai_agent', 'voicemail', 'reserve_only'],
};

export const DEFAULT_TENANT_CALLS_FEATURES: TenantCallsFeatureSettings = {
  showInbound: true,
  showOutbound: true,
  recordInbound: true,
  recordOutbound: true,
};

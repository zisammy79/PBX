import { z } from 'zod';

export const TwilioNumberAssignmentModeSchema = z.enum(['manual', 'auto', 'manual_or_auto']);
export type TwilioNumberAssignmentMode = z.infer<typeof TwilioNumberAssignmentModeSchema>;

export const TwilioPhoneProvisioningStatusSchema = z.enum([
  'pending_number_assignment',
  'number_assigned',
  'number_assignment_failed',
  'trunk_configured',
  'ready_for_sip_test',
]);
export type TwilioPhoneProvisioningStatus = z.infer<typeof TwilioPhoneProvisioningStatusSchema>;

export const TwilioNumberTypeSchema = z.enum(['local', 'mobile', 'toll_free', 'any']);
export type TwilioNumberType = z.infer<typeof TwilioNumberTypeSchema>;

export const TwilioNumberSearchLimitSchema = z.coerce.number().int().min(1).max(50).default(25);

export const TwilioNumberSearchQuerySchema = z.object({
  country: z.string().length(2).default('IL'),
  type: TwilioNumberTypeSchema.default('local'),
  areaCode: z.string().max(8).optional(),
  contains: z.string().max(16).optional(),
  voiceRequired: z.coerce.boolean().default(true),
  smsCapable: z.coerce.boolean().optional(),
  mmsCapable: z.coerce.boolean().optional(),
  limit: TwilioNumberSearchLimitSchema,
});

export const TwilioNumberDestinationTypeSchema = z.enum([
  'extension',
  'ai_agent',
  'voicemail',
  'reserve_only',
]);
export type TwilioNumberDestinationType = z.infer<typeof TwilioNumberDestinationTypeSchema>;

export const AssignableDestinationTypeSchema = z.enum([
  'extension',
  'ai_agent',
  'voicemail',
  'reserve_only',
]);
export type AssignableDestinationType = z.infer<typeof AssignableDestinationTypeSchema>;

export type AssignableDestination = {
  type: AssignableDestinationType;
  id: string;
  value: string;
  label: string;
  status?: string;
  metadata?: Record<string, unknown>;
};

export type AssignableDestinationsResponse = {
  tenantId: string;
  tenantSlug: string;
  destinations: AssignableDestination[];
};

/** Tenant route/body reference: canonical UUID or tenant slug. */
export const TenantRefSchema = z.string().min(1).max(128);

export const TwilioOutboundCallerIdPolicySchema = z.enum([
  'tenant_default',
  'extension_only',
  'inbound_only',
]);
export type TwilioOutboundCallerIdPolicy = z.infer<typeof TwilioOutboundCallerIdPolicySchema>;

export const TwilioNumberAssignmentSchema = z.object({
  tenantId: TenantRefSchema,
  destinationType: TwilioNumberDestinationTypeSchema.default('extension'),
  destinationExtensionNumber: z.string().regex(/^\d{3,6}$/).optional(),
  destinationId: z.string().uuid().optional(),
  outboundCallerIdPolicy: TwilioOutboundCallerIdPolicySchema.default('tenant_default'),
});

export const TwilioPurchaseNumberSchema = z.object({
  e164: z.string().regex(/^\+[1-9]\d{6,14}$/),
  friendlyName: z.string().max(255).optional(),
  confirmPurchase: z.literal(true, {
    errorMap: () => ({ message: 'Explicit purchase confirmation is required' }),
  }),
});

export const TwilioPurchaseAndAssignSchema = TwilioNumberAssignmentSchema.extend({
  e164: z.string().regex(/^\+[1-9]\d{6,14}$/),
  friendlyName: z.string().max(255).optional(),
  confirmPurchase: z.literal(true, {
    errorMap: () => ({ message: 'Explicit purchase confirmation is required' }),
  }),
});

export const AssignExistingTwilioNumberSchema = z.object({
  tenantId: z.string().uuid(),
  e164: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
  inboundDestinationExtensionNumber: z.string().regex(/^\d{3,6}$/).optional(),
});

export const PurchaseTwilioNumberSchema = z.object({
  tenantId: z.string().uuid(),
  inboundDestinationExtensionNumber: z.string().regex(/^\d{3,6}$/).optional(),
});

export const ProvisionTenantPhoneNumberSchema = z.object({
  inboundDestinationExtensionNumber: z.string().regex(/^\d{3,6}$/).optional(),
  force: z.boolean().default(false),
});

export type TwilioNumberSearchQuery = z.infer<typeof TwilioNumberSearchQuerySchema>;
export type TwilioNumberAssignment = z.infer<typeof TwilioNumberAssignmentSchema>;
export type TwilioPurchaseNumber = z.infer<typeof TwilioPurchaseNumberSchema>;
export type TwilioPurchaseAndAssign = z.infer<typeof TwilioPurchaseAndAssignSchema>;
export type AssignExistingTwilioNumber = z.infer<typeof AssignExistingTwilioNumberSchema>;
export type PurchaseTwilioNumber = z.infer<typeof PurchaseTwilioNumberSchema>;
export type ProvisionTenantPhoneNumber = z.infer<typeof ProvisionTenantPhoneNumberSchema>;

export type TwilioAvailableNumberRow = {
  e164: string;
  friendlyName: string | null;
  locality: string | null;
  region: string | null;
  country: string;
  numberType: Exclude<TwilioNumberType, 'any'>;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
  addressRequirement: string | null;
  regulatoryStatus: 'none' | 'requires_regulatory_setup';
  monthlyPrice: string | null;
};

export type TenantPhoneNumberRow = {
  id: string;
  tenantId: string;
  e164: string;
  friendlyName: string | null;
  provider: string;
  providerSid: string | null;
  status: string;
  capabilities: Record<string, unknown>;
  regulatoryStatus: string | null;
  trunkId: string | null;
  inboundRouteId: string | null;
  isActive: boolean;
  destinationType: string | null;
  destinationId: string | null;
  onTwilioTrunk: boolean;
};

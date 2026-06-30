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

export type AssignExistingTwilioNumber = z.infer<typeof AssignExistingTwilioNumberSchema>;
export type PurchaseTwilioNumber = z.infer<typeof PurchaseTwilioNumberSchema>;
export type ProvisionTenantPhoneNumber = z.infer<typeof ProvisionTenantPhoneNumberSchema>;

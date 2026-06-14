import { z } from 'zod';

export const SipDeviceTypeSchema = z.enum([
  'desktop_softphone',
  'mobile_softphone',
  'desk_phone',
  'browser',
  'other',
  'legacy',
]);

export const SipDeviceStatusSchema = z.enum([
  'draft',
  'provisioning',
  'ready',
  'failed',
  'disabled',
  'revoked',
]);

export type SipDeviceType = z.infer<typeof SipDeviceTypeSchema>;
export type SipDeviceStatus = z.infer<typeof SipDeviceStatusSchema>;

export const CreateSipDeviceSchema = z.object({
  name: z.string().min(1).max(255),
  deviceType: SipDeviceTypeSchema.exclude(['legacy']),
});

export type CreateSipDeviceRequest = z.infer<typeof CreateSipDeviceSchema>;

export const UpdateSipDeviceSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  deviceType: SipDeviceTypeSchema.optional(),
});

export type UpdateSipDeviceRequest = z.infer<typeof UpdateSipDeviceSchema>;

export const SipDeviceSummarySchema = z.object({
  id: z.string().uuid(),
  extensionId: z.string().uuid(),
  name: z.string(),
  deviceType: SipDeviceTypeSchema,
  status: SipDeviceStatusSchema,
  provisioningStatus: z.string(),
  sipUsername: z.string().nullable(),
  registrationStatus: z.enum(['online', 'offline', 'unknown']).nullable(),
  lastRegisteredAt: z.string().datetime().nullable(),
  lastSeenAt: z.string().datetime().nullable(),
  credentialRotatedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
});

export type SipDeviceSummary = z.infer<typeof SipDeviceSummarySchema>;

export const SipDeviceCredentialResponseSchema = z.object({
  device: SipDeviceSummarySchema,
  sipCredential: z.object({
    username: z.string(),
    secret: z.string(),
    domain: z.string(),
  }),
  setup: z.object({
    transport: z.literal('UDP'),
    port: z.number().int(),
    authUsernameSameAsUsername: z.literal(true),
    outboundProxy: z.literal('none'),
  }),
});

export type SipDeviceCredentialResponse = z.infer<typeof SipDeviceCredentialResponseSchema>;

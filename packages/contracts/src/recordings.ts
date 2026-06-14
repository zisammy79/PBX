import { z } from 'zod';

export const RecordingStatusSchema = z.enum([
  'pending',
  'recording',
  'processing',
  'available',
  'failed',
  'deleted',
]);

export type RecordingStatus = z.infer<typeof RecordingStatusSchema>;

export const ExtensionRecordingPolicyModeSchema = z.enum(['inherit', 'on', 'off']);

export type ExtensionRecordingPolicyMode = z.infer<typeof ExtensionRecordingPolicyModeSchema>;

export const TenantTelephonySettingsSchema = z.object({
  recordCallsByDefault: z.boolean(),
});

export type TenantTelephonySettings = z.infer<typeof TenantTelephonySettingsSchema>;

export const UpdateTenantTelephonySettingsSchema = z.object({
  recordCallsByDefault: z.boolean(),
});

export type UpdateTenantTelephonySettings = z.infer<typeof UpdateTenantTelephonySettingsSchema>;

export const UpdateExtensionRecordingPolicySchema = z.object({
  recordingPolicyMode: ExtensionRecordingPolicyModeSchema,
});

export type UpdateExtensionRecordingPolicy = z.infer<typeof UpdateExtensionRecordingPolicySchema>;

export const CallRecordingSummarySchema = z.object({
  id: z.string().uuid(),
  callId: z.string().uuid(),
  status: RecordingStatusSchema,
  mimeType: z.string().nullable(),
  format: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  fileSizeBytes: z.number().int().nullable(),
  startedAt: z.string().datetime().nullable(),
  completedAt: z.string().datetime().nullable(),
  playbackAvailable: z.boolean(),
  failureCode: z.string().nullable(),
  playbackUrl: z.string().optional(),
});

export type CallRecordingSummary = z.infer<typeof CallRecordingSummarySchema>;

export const ExtensionRecordingListItemSchema = z.object({
  id: z.string().uuid(),
  callId: z.string().uuid(),
  status: RecordingStatusSchema,
  direction: z.enum(['inbound', 'outbound', 'internal']),
  remoteParty: z.string().nullable(),
  callStatus: z.string(),
  startedAt: z.string().datetime(),
  callDurationSeconds: z.number().int().nullable(),
  recordingDurationSeconds: z.number().int().nullable(),
  format: z.string().nullable(),
  playbackAvailable: z.boolean(),
});

export type ExtensionRecordingListItem = z.infer<typeof ExtensionRecordingListItemSchema>;

export const RecordingPlaybackResponseSchema = z.object({
  playbackUrl: z.string(),
  expiresAt: z.string().datetime().nullable(),
  contentType: z.string(),
  durationSeconds: z.number().int().nullable(),
});

export type RecordingPlaybackResponse = z.infer<typeof RecordingPlaybackResponseSchema>;

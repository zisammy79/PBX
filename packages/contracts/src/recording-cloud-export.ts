import { z } from 'zod';

export const CloudStorageProviderSchema = z.enum(['google_drive', 'microsoft_onedrive']);

export type CloudStorageProvider = z.infer<typeof CloudStorageProviderSchema>;

export const RecordingCloudExportSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: CloudStorageProviderSchema.nullable(),
  connectionId: z.string().uuid().nullable(),
  folderPath: z.string().max(512).nullable(),
  isolationFolder: z.string().max(512).nullable(),
});

export type RecordingCloudExportSettings = z.infer<typeof RecordingCloudExportSettingsSchema>;

export const UpdateRecordingCloudExportSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: CloudStorageProviderSchema.nullable().optional(),
  connectionId: z.string().uuid().nullable().optional(),
  folderPath: z.string().max(512).nullable().optional(),
});

export type UpdateRecordingCloudExportSettings = z.infer<typeof UpdateRecordingCloudExportSettingsSchema>;

export const CloudStorageConnectionSummarySchema = z.object({
  id: z.string().uuid(),
  provider: CloudStorageProviderSchema,
  displayName: z.string(),
  scopeType: z.enum(['platform', 'tenant']),
  connectionSource: z.enum(['tenant_owned', 'platform_owned', 'platform_assigned']),
  enabled: z.boolean(),
  accountEmail: z.string().nullable(),
  accountName: z.string().nullable(),
  folderPath: z.string().nullable(),
  validationStatus: z.string(),
});

export type CloudStorageConnectionSummary = z.infer<typeof CloudStorageConnectionSummarySchema>;

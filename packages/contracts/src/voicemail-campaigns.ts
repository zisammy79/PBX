import { z } from 'zod';
import { PaginationQuerySchema } from './pagination.js';

export const ListVoicemailsQuerySchema = z.object({
  extensionId: z.string().uuid().optional(),
});

export const MarkVoicemailReadSchema = z.object({
  isRead: z.boolean().default(true),
});

export const CreateMohClassSchema = z.object({
  name: z.string().min(1).max(255),
  mediaFileIds: z.array(z.string().uuid()).default([]),
  randomize: z.boolean().default(false),
  isDefault: z.boolean().default(false),
});

export const UpdateMohClassSchema = CreateMohClassSchema.partial();

export const ListMohClassesQuerySchema = z.object({});

export const CampaignTechnologySchema = z.enum(['voice', 'sms', 'fax']);

export const CampaignStatusSchema = z.enum(['draft', 'ready', 'running', 'paused', 'completed']);

export const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  technology: CampaignTechnologySchema.default('voice'),
  maxConcurrent: z.number().int().min(1).max(1000).default(1),
  maxAttempts: z.number().int().min(1).max(100).default(3),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
});

export const UpdateCampaignSchema = CreateCampaignSchema.partial().extend({
  status: CampaignStatusSchema.optional(),
});

export const ListCampaignsQuerySchema = z.object({});

export const ImportCampaignNumbersSchema = z.object({
  numbers: z.array(z.string().min(1).max(64)).min(1).max(10_000),
});

export const ListCampaignNumbersQuerySchema = PaginationQuerySchema;

export const CampaignNumberImportQuerySchema = z.object({
  skipDnc: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((value) => value === true || value === 'true'),
});

export const CreateTelephonyCronJobSchema = z.object({
  name: z.string().min(1).max(255),
  jobType: z.string().min(1).max(64),
  enabled: z.boolean().default(true),
  schedule: z.record(z.unknown()).default({}),
  timezone: z.string().min(1).max(64).default('UTC'),
});

export const UpdateTelephonyCronJobSchema = CreateTelephonyCronJobSchema.partial();

export const ListTelephonyCronJobsQuerySchema = z.object({});

export type ListVoicemailsQuery = z.infer<typeof ListVoicemailsQuerySchema>;
export type MarkVoicemailRead = z.infer<typeof MarkVoicemailReadSchema>;
export type CreateMohClass = z.infer<typeof CreateMohClassSchema>;
export type UpdateMohClass = z.infer<typeof UpdateMohClassSchema>;
export type CreateCampaign = z.infer<typeof CreateCampaignSchema>;
export type UpdateCampaign = z.infer<typeof UpdateCampaignSchema>;
export type ImportCampaignNumbers = z.infer<typeof ImportCampaignNumbersSchema>;
export type ListCampaignNumbersQuery = z.infer<typeof ListCampaignNumbersQuerySchema>;
export type CampaignNumberImportQuery = z.infer<typeof CampaignNumberImportQuerySchema>;
export type CreateTelephonyCronJob = z.infer<typeof CreateTelephonyCronJobSchema>;
export type UpdateTelephonyCronJob = z.infer<typeof UpdateTelephonyCronJobSchema>;

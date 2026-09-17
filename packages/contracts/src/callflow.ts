import { z } from 'zod';

export const CustomDestinationTypeSchema = z.enum([
  'forward_number',
  'set_language',
  'set_variable',
  'webhook_on_answer',
]);

export type CustomDestinationType = z.infer<typeof CustomDestinationTypeSchema>;

export const DncListTypeSchema = z.enum(['dnc', 'allow']);

export type DncListType = z.infer<typeof DncListTypeSchema>;

export const IvrOptionSchema = z.object({
  digit: z.string().min(1).max(2),
  destinationType: z.string().min(1).max(64),
  destinationId: z.string().uuid().nullable().optional(),
});

export type IvrOption = z.infer<typeof IvrOptionSchema>;

export const QueueMemberSchema = z.object({
  extensionId: z.string().uuid(),
  penalty: z.number().int().min(0).default(0),
});

export type QueueMember = z.infer<typeof QueueMemberSchema>;

export const RingGroupMemberSchema = z.object({
  extensionId: z.string().uuid(),
  priority: z.number().int().min(1).default(1),
});

export type RingGroupMember = z.infer<typeof RingGroupMemberSchema>;

export const CreateBusinessScheduleSchema = z.object({
  name: z.string().min(1).max(255),
  timezone: z.string().min(1).max(64).default('UTC'),
  scheduleType: z.string().min(1).max(32).default('weektime'),
  rules: z.array(z.record(z.unknown())).default([]),
  openDestinationType: z.string().max(64).nullable().optional(),
  openDestinationId: z.string().uuid().nullable().optional(),
  closedDestinationType: z.string().max(64).nullable().optional(),
  closedDestinationId: z.string().uuid().nullable().optional(),
});

export const UpdateBusinessScheduleSchema = CreateBusinessScheduleSchema.partial();

export const ListBusinessSchedulesQuerySchema = z.object({});

export const CreateIvrSchema = z.object({
  name: z.string().min(1).max(255),
  greetingAudioKey: z.string().max(512).nullable().optional(),
  timeoutSeconds: z.number().int().min(1).max(300).default(10),
  maxRetries: z.number().int().min(0).max(10).default(3),
  allowDialExtensions: z.boolean().default(false),
  allowFeatureCodes: z.boolean().default(false),
  language: z.string().min(2).max(8).default('he'),
  options: z.array(IvrOptionSchema).default([]),
});

export const UpdateIvrSchema = CreateIvrSchema.partial().extend({
  options: z.array(IvrOptionSchema).optional(),
});

export const ListIvrsQuerySchema = z.object({});

export const CreateQueueSchema = z.object({
  name: z.string().min(1).max(255),
  strategy: z.string().min(1).max(32).default('ringall'),
  maxWaitSeconds: z.number().int().min(1).max(86400).default(300),
  number: z.string().max(16).nullable().optional(),
  recordAlways: z.boolean().default(false),
  mohClassId: z.string().uuid().nullable().optional(),
  members: z.array(QueueMemberSchema).default([]),
});

export const UpdateQueueSchema = CreateQueueSchema.partial().extend({
  members: z.array(QueueMemberSchema).optional(),
});

export const ListQueuesQuerySchema = z.object({});

export const CreateRingGroupSchema = z.object({
  name: z.string().min(1).max(255),
  strategy: z.string().min(1).max(32).default('simultaneous'),
  timeoutSeconds: z.number().int().min(1).max(300).default(30),
  members: z.array(RingGroupMemberSchema).default([]),
});

export const UpdateRingGroupSchema = CreateRingGroupSchema.partial().extend({
  members: z.array(RingGroupMemberSchema).optional(),
});

export const ListRingGroupsQuerySchema = z.object({});

export const CreateMediaFileSchema = z.object({
  name: z.string().min(1).max(255),
  format: z.string().min(1).max(32),
  sizeBytes: z.number().int().positive(),
  md5: z.string().length(32),
  storageKey: z.string().min(1).max(512),
});

export const UpdateMediaFileSchema = CreateMediaFileSchema.partial();

export const ListMediaFilesQuerySchema = z.object({});

export const CreateFeatureCodeSchema = z.object({
  code: z.string().min(1).max(16),
  description: z.string().max(2000).nullable().optional(),
  actionType: z.string().min(1).max(64),
  actionConfig: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
});

export const UpdateFeatureCodeSchema = CreateFeatureCodeSchema.partial();

export const ListFeatureCodesQuerySchema = z.object({});

export const CreateBlacklistEntrySchema = z.object({
  numberPattern: z.string().min(1).max(64),
  description: z.string().max(2000).nullable().optional(),
});

export const UpdateBlacklistEntrySchema = CreateBlacklistEntrySchema.partial();

export const ListBlacklistQuerySchema = z.object({});

export const CreateShortNumberSchema = z.object({
  shortCode: z.string().min(1).max(16),
  destinationType: z.string().min(1).max(64),
  destinationValue: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
});

export const UpdateShortNumberSchema = CreateShortNumberSchema.partial();

export const ListShortNumbersQuerySchema = z.object({});

export const CreateCustomDestinationSchema = z.object({
  name: z.string().min(1).max(255),
  destinationType: CustomDestinationTypeSchema,
  config: z.record(z.unknown()).default({}),
});

export const UpdateCustomDestinationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  destinationType: CustomDestinationTypeSchema.optional(),
  config: z.record(z.unknown()).optional(),
});

export const ListCustomDestinationsQuerySchema = z.object({});

export const CreateConferenceSchema = z.object({
  name: z.string().min(1).max(255),
  number: z.string().min(1).max(16),
  pin: z.string().max(32).nullable().optional(),
  adminPin: z.string().max(32).nullable().optional(),
  maxParticipants: z.number().int().min(2).max(1000).default(10),
});

export const UpdateConferenceSchema = CreateConferenceSchema.partial();

export const ListConferencesQuerySchema = z.object({});

export const CreatePagingGroupSchema = z.object({
  name: z.string().min(1).max(255),
  number: z.string().min(1).max(16),
  bidirectional: z.boolean().default(false),
  memberExtensionIds: z.array(z.string().uuid()).default([]),
});

export const UpdatePagingGroupSchema = CreatePagingGroupSchema.partial();

export const ListPagingGroupsQuerySchema = z.object({});

export const CreatePhonebookEntrySchema = z.object({
  bookName: z.string().min(1).max(128).default('default'),
  displayName: z.string().min(1).max(255),
  number: z.string().min(1).max(64),
  metadata: z.record(z.unknown()).default({}),
});

export const UpdatePhonebookEntrySchema = CreatePhonebookEntrySchema.partial();

export const ListPhonebookEntriesQuerySchema = z.object({
  bookName: z.string().max(128).optional(),
});

export const CreateDncListSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  listType: DncListTypeSchema.default('dnc'),
});

export const UpdateDncListSchema = CreateDncListSchema.partial();

export const ListDncListsQuerySchema = z.object({});

export const AddDncListNumberSchema = z.object({
  number: z.string().min(1).max(64),
});

export const RemoveDncListNumberSchema = z.object({
  number: z.string().min(1).max(64),
});

export const UpdateTenantLocalesSchema = z.object({
  enabledLocales: z.array(z.string().min(2).max(8)).min(1),
  defaultLocale: z.string().min(2).max(8),
});

export const PlatformLocalePackSchema = z.object({
  locale: z.string().min(2).max(8),
  label: z.string().min(1).max(255),
  direction: z.enum(['ltr', 'rtl']).default('ltr'),
  messages: z.record(z.unknown()).default({}),
  version: z.number().int().positive().default(1),
});

export const PutPlatformLocalePacksSchema = z.object({
  items: z.array(PlatformLocalePackSchema).min(1),
});

export const CreatePlatformHolidayTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  timezone: z.string().min(1).max(64).default('Asia/Jerusalem'),
  rules: z.array(z.record(z.unknown())).default([]),
});

export const DEFAULT_TENANT_LOCALES = ['he', 'en', 'fr'] as const;

export type CreateBusinessSchedule = z.infer<typeof CreateBusinessScheduleSchema>;
export type UpdateBusinessSchedule = z.infer<typeof UpdateBusinessScheduleSchema>;
export type CreateIvr = z.infer<typeof CreateIvrSchema>;
export type UpdateIvr = z.infer<typeof UpdateIvrSchema>;
export type CreateQueue = z.infer<typeof CreateQueueSchema>;
export type UpdateQueue = z.infer<typeof UpdateQueueSchema>;
export type CreateRingGroup = z.infer<typeof CreateRingGroupSchema>;
export type UpdateRingGroup = z.infer<typeof UpdateRingGroupSchema>;
export type CreateMediaFile = z.infer<typeof CreateMediaFileSchema>;
export type UpdateMediaFile = z.infer<typeof UpdateMediaFileSchema>;
export type CreateFeatureCode = z.infer<typeof CreateFeatureCodeSchema>;
export type UpdateFeatureCode = z.infer<typeof UpdateFeatureCodeSchema>;
export type CreateBlacklistEntry = z.infer<typeof CreateBlacklistEntrySchema>;
export type UpdateBlacklistEntry = z.infer<typeof UpdateBlacklistEntrySchema>;
export type CreateShortNumber = z.infer<typeof CreateShortNumberSchema>;
export type UpdateShortNumber = z.infer<typeof UpdateShortNumberSchema>;
export type CreateCustomDestination = z.infer<typeof CreateCustomDestinationSchema>;
export type UpdateCustomDestination = z.infer<typeof UpdateCustomDestinationSchema>;
export type CreateConference = z.infer<typeof CreateConferenceSchema>;
export type UpdateConference = z.infer<typeof UpdateConferenceSchema>;
export type CreatePagingGroup = z.infer<typeof CreatePagingGroupSchema>;
export type UpdatePagingGroup = z.infer<typeof UpdatePagingGroupSchema>;
export type CreatePhonebookEntry = z.infer<typeof CreatePhonebookEntrySchema>;
export type UpdatePhonebookEntry = z.infer<typeof UpdatePhonebookEntrySchema>;
export type CreateDncList = z.infer<typeof CreateDncListSchema>;
export type UpdateDncList = z.infer<typeof UpdateDncListSchema>;
export type UpdateTenantLocales = z.infer<typeof UpdateTenantLocalesSchema>;
export type AddDncListNumber = z.infer<typeof AddDncListNumberSchema>;
export type PlatformLocalePack = z.infer<typeof PlatformLocalePackSchema>;
export type CreatePlatformHolidayTemplate = z.infer<typeof CreatePlatformHolidayTemplateSchema>;

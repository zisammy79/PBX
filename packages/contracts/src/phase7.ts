import { z } from 'zod';

export const ButtonTypeSchema = z.enum(['blf', 'speed_dial', 'line', 'custom']);

export const ButtonLayoutButtonSchema = z.object({
  type: ButtonTypeSchema,
  label: z.string().min(1).max(64),
  value: z.string().min(1).max(255),
  extensionId: z.string().uuid().optional(),
});

export const CreateButtonLayoutSchema = z.object({
  name: z.string().min(1).max(255),
  vendorTemplate: z.string().min(1).max(64).default('generic'),
  code: z.string().max(32).nullable().optional(),
  lineStart: z.number().int().min(1).max(999).default(1),
  lineEnd: z.number().int().min(1).max(999).default(10),
  buttons: z.array(ButtonLayoutButtonSchema).default([]),
});

export const UpdateButtonLayoutSchema = CreateButtonLayoutSchema.partial();

export const AssignButtonLayoutSchema = z
  .object({
    deviceId: z.string().uuid().optional(),
    extensionId: z.string().uuid().optional(),
  })
  .refine((v) => v.deviceId || v.extensionId, {
    message: 'deviceId or extensionId is required',
  });

export const FaxDirectionSchema = z.enum(['inbound', 'outbound']);

export const FaxStatusSchema = z.enum(['queued', 'sending', 'received', 'failed', 'read']);

export const CreateOutboundFaxSchema = z.object({
  remoteNumber: z.string().min(1).max(64),
  localNumber: z.string().min(1).max(64),
  pages: z.number().int().min(0).max(1000).default(0),
});

export const MarkFaxReadSchema = z.object({
  isRead: z.boolean().default(true),
});

export const ListFaxesQuerySchema = z.object({
  direction: FaxDirectionSchema.optional(),
  status: FaxStatusSchema.optional(),
});

export const ListSmsMessagesQuerySchema = z.object({
  campaignId: z.string().uuid().optional(),
});

export const PHONE_VENDOR_TEMPLATES = [
  { id: 'generic', label: 'Generic' },
  { id: 'yealink', label: 'Yealink' },
  { id: 'fanvil', label: 'Fanvil' },
] as const;

export type CreateButtonLayout = z.infer<typeof CreateButtonLayoutSchema>;
export type UpdateButtonLayout = z.infer<typeof UpdateButtonLayoutSchema>;
export type AssignButtonLayout = z.infer<typeof AssignButtonLayoutSchema>;
export type CreateOutboundFax = z.infer<typeof CreateOutboundFaxSchema>;
export type MarkFaxRead = z.infer<typeof MarkFaxReadSchema>;
export type ListFaxesQuery = z.infer<typeof ListFaxesQuerySchema>;
export type ListSmsMessagesQuery = z.infer<typeof ListSmsMessagesQuerySchema>;

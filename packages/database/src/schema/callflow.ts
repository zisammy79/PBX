import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const mediaFiles = pgTable(
  'media_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    format: varchar('format', { length: 32 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    md5: varchar('md5', { length: 32 }).notNull(),
    storageKey: varchar('storage_key', { length: 512 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('media_files_tenant_idx').on(table.tenantId)],
);

export const mohClasses = pgTable(
  'moh_classes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    mediaFileIds: jsonb('media_file_ids').notNull().default([]),
    randomize: boolean('randomize').notNull().default(false),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('moh_classes_tenant_idx').on(table.tenantId)],
);

export const featureCodes = pgTable(
  'feature_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    code: varchar('code', { length: 16 }).notNull(),
    description: text('description'),
    actionType: varchar('action_type', { length: 64 }).notNull(),
    actionConfig: jsonb('action_config').notNull().default({}),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('feature_codes_tenant_code_uidx').on(table.tenantId, table.code),
    index('feature_codes_tenant_idx').on(table.tenantId),
  ],
);

export const blacklistEntries = pgTable(
  'blacklist_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    numberPattern: varchar('number_pattern', { length: 64 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('blacklist_entries_tenant_idx').on(table.tenantId)],
);

export const shortNumbers = pgTable(
  'short_numbers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    shortCode: varchar('short_code', { length: 16 }).notNull(),
    destinationType: varchar('destination_type', { length: 64 }).notNull(),
    destinationValue: varchar('destination_value', { length: 255 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('short_numbers_tenant_code_uidx').on(table.tenantId, table.shortCode),
    index('short_numbers_tenant_idx').on(table.tenantId),
  ],
);

export const customDestinations = pgTable(
  'custom_destinations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    destinationType: varchar('destination_type', { length: 64 }).notNull(),
    config: jsonb('config').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('custom_destinations_tenant_idx').on(table.tenantId)],
);

export const conferences = pgTable(
  'conferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    number: varchar('number', { length: 16 }).notNull(),
    pin: varchar('pin', { length: 32 }),
    adminPin: varchar('admin_pin', { length: 32 }),
    maxParticipants: integer('max_participants').notNull().default(10),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('conferences_tenant_number_uidx').on(table.tenantId, table.number),
    index('conferences_tenant_idx').on(table.tenantId),
  ],
);

export const pagingGroups = pgTable(
  'paging_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    number: varchar('number', { length: 16 }).notNull(),
    bidirectional: boolean('bidirectional').notNull().default(false),
    memberExtensionIds: jsonb('member_extension_ids').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('paging_groups_tenant_idx').on(table.tenantId)],
);

export const phonebookEntries = pgTable(
  'phonebook_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    bookName: varchar('book_name', { length: 128 }).notNull().default('default'),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    number: varchar('number', { length: 64 }).notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('phonebook_entries_tenant_idx').on(table.tenantId)],
);

export const dncLists = pgTable(
  'dnc_lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    listType: varchar('list_type', { length: 32 }).notNull().default('dnc'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('dnc_lists_tenant_idx').on(table.tenantId)],
);

export const dncListNumbers = pgTable(
  'dnc_list_numbers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    listId: uuid('list_id')
      .notNull()
      .references(() => dncLists.id, { onDelete: 'cascade' }),
    number: varchar('number', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('dnc_list_numbers_list_number_uidx').on(table.listId, table.number),
    index('dnc_list_numbers_tenant_idx').on(table.tenantId),
    index('dnc_list_numbers_list_idx').on(table.listId),
  ],
);

export const platformLocalePacks = pgTable(
  'platform_locale_packs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    locale: varchar('locale', { length: 8 }).notNull(),
    label: varchar('label', { length: 255 }).notNull(),
    direction: varchar('direction', { length: 3 }).notNull().default('ltr'),
    messages: jsonb('messages').notNull().default({}),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('platform_locale_packs_locale_uidx').on(table.locale)],
);

export const platformHolidayTemplates = pgTable(
  'platform_holiday_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Jerusalem'),
    rules: jsonb('rules').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('platform_holiday_templates_name_idx').on(table.name)],
);

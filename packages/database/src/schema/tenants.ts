import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { tenantStatusEnum } from './enums';
import { users } from './users';

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 63 }).notNull(),
    status: tenantStatusEnum('status').notNull().default('provisioning'),
    asteriskContext: varchar('asterisk_context', { length: 128 }).notNull(),
    planId: uuid('plan_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('tenants_slug_uidx').on(table.slug),
    index('tenants_status_idx').on(table.status),
  ],
);

export const tenantLimitOverrides = pgTable(
  'tenant_limit_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    dimension: varchar('dimension', { length: 64 }).notNull(),
    limitValue: numeric('limit_value', { precision: 18, scale: 6 }).notNull(),
    reason: text('reason'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('tenant_limit_overrides_uidx').on(table.tenantId, table.dimension),
    index('tenant_limit_overrides_tenant_idx').on(table.tenantId),
  ],
);

export const tenantSettings = pgTable(
  'tenant_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 128 }).notNull(),
    value: jsonb('value').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('tenant_settings_tenant_key_uidx').on(table.tenantId, table.key),
    index('tenant_settings_tenant_idx').on(table.tenantId),
  ],
);

export const locations = pgTable(
  'locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
    address: jsonb('address'),
    emergencyEnabled: boolean('emergency_enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('locations_tenant_idx').on(table.tenantId)],
);

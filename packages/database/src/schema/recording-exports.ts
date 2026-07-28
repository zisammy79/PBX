import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { callRecordings } from './calls.js';
import { integrationConnections } from './integrations.js';
import { tenants } from './tenants.js';

export const recordingCloudExports = pgTable(
  'recording_cloud_exports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    recordingId: uuid('recording_id')
      .notNull()
      .references(() => callRecordings.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => integrationConnections.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 64 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('pending'),
    cloudFileId: varchar('cloud_file_id', { length: 512 }),
    cloudFilePath: varchar('cloud_file_path', { length: 1024 }),
    cloudFileUrl: text('cloud_file_url'),
    errorCode: varchar('error_code', { length: 64 }),
    errorMessage: text('error_message'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    exportedAt: timestamp('exported_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('recording_cloud_exports_recording_conn_uidx').on(table.recordingId, table.connectionId),
    index('recording_cloud_exports_tenant_idx').on(table.tenantId),
    index('recording_cloud_exports_status_idx').on(table.status),
  ],
);

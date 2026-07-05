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
import { users } from './users.js';

export const integrationConnections = pgTable(
  'integration_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    integrationType: varchar('integration_type', { length: 64 }).notNull(),
    provider: varchar('provider', { length: 64 }).notNull(),
    scopeType: varchar('scope_type', { length: 16 }).notNull(),
    scopeId: uuid('scope_id').references(() => tenants.id, { onDelete: 'cascade' }),
    environment: varchar('environment', { length: 16 }).notNull().default('default'),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    isDefault: boolean('is_default').notNull().default(false),
    config: jsonb('config').notNull().default({}),
    encryptedPayload: text('encrypted_payload'),
    encryptionKeyVersion: varchar('encryption_key_version', { length: 16 }).notNull().default('v1'),
    credentialVersion: integer('credential_version').notNull().default(1),
    validationStatus: varchar('validation_status', { length: 32 }).notNull().default('NOT_CONFIGURED'),
    lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
    sanitizedValidationError: text('sanitized_validation_error'),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('integration_connections_type_idx').on(table.integrationType, table.provider),
    index('integration_connections_scope_idx').on(table.scopeType, table.scopeId),
    index('integration_connections_enabled_idx').on(table.enabled),
  ],
);

export const integrationCredentialVersions = pgTable(
  'integration_credential_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => integrationConnections.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    encryptedPayload: text('encrypted_payload').notNull(),
    encryptionKeyVersion: varchar('encryption_key_version', { length: 16 }).notNull().default('v1'),
    isActive: boolean('is_active').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('integration_credential_versions_uidx').on(table.connectionId, table.version),
    index('integration_credential_versions_conn_idx').on(table.connectionId),
  ],
);

export const integrationAssignments = pgTable(
  'integration_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => integrationConnections.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('integration_assignments_uidx').on(table.connectionId, table.tenantId),
    index('integration_assignments_tenant_idx').on(table.tenantId),
  ],
);

export const integrationValidations = pgTable(
  'integration_validations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => integrationConnections.id, { onDelete: 'cascade' }),
    validationLevel: varchar('validation_level', { length: 32 }).notNull(),
    status: varchar('status', { length: 64 }).notNull(),
    sanitizedResult: jsonb('sanitized_result').notNull().default({}),
    roundTripMs: integer('round_trip_ms'),
    credentialVersion: integer('credential_version'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('integration_validations_conn_idx').on(table.connectionId),
    index('integration_validations_created_idx').on(table.createdAt),
  ],
);

export const integrationAuditEvents = pgTable(
  'integration_audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectionId: uuid('connection_id').references(() => integrationConnections.id, { onDelete: 'set null' }),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    action: varchar('action', { length: 128 }).notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('integration_audit_connection_idx').on(table.connectionId),
    index('integration_audit_tenant_idx').on(table.tenantId),
    index('integration_audit_created_idx').on(table.createdAt),
  ],
);

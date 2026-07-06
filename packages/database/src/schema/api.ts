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
import { providerHealthStatusEnum, webhookDeliveryStatusEnum } from './enums.js';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const apiApplications = pgTable(
  'api_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    scopes: text('scopes').array().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('api_applications_tenant_idx').on(table.tenantId)],
);

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => apiApplications.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    keyPrefix: varchar('key_prefix', { length: 16 }).notNull(),
    keyHash: text('key_hash').notNull(),
    scopes: text('scopes').array().notNull().default([]),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    rotatedFromKeyId: uuid('rotated_from_key_id'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('api_keys_tenant_idx').on(table.tenantId),
    index('api_keys_prefix_idx').on(table.keyPrefix),
    uniqueIndex('api_keys_prefix_active_uidx').on(table.keyPrefix),
  ],
);

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    description: text('description'),
    secretEncrypted: text('secret_encrypted').notNull(),
    secretVersion: integer('secret_version').notNull().default(1),
    eventTypes: text('event_types').array().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    lastSuccessfulDeliveryAt: timestamp('last_successful_delivery_at', { withTimezone: true }),
    lastFailedDeliveryAt: timestamp('last_failed_delivery_at', { withTimezone: true }),
    failureCount: integer('failure_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('webhook_endpoints_tenant_idx').on(table.tenantId)],
);

export const platformEvents = pgTable(
  'platform_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    apiVersion: varchar('api_version', { length: 8 }).notNull().default('v1'),
    correlationId: uuid('correlation_id'),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('platform_events_tenant_idx').on(table.tenantId),
    index('platform_events_type_idx').on(table.eventType),
  ],
);

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    routeKey: varchar('route_key', { length: 128 }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    responseStatus: integer('response_status').notNull(),
    responseBody: jsonb('response_body').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('idempotency_records_uidx').on(table.tenantId, table.routeKey, table.idempotencyKey),
    index('idempotency_records_expires_idx').on(table.expiresAt),
  ],
);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id),
    eventId: uuid('event_id').notNull(),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    payload: jsonb('payload').notNull(),
    status: webhookDeliveryStatusEnum('status').notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    responseStatus: integer('response_status'),
    responseBody: text('response_body'),
    durationMs: integer('duration_ms'),
    errorCategory: varchar('error_category', { length: 32 }),
    correlationId: uuid('correlation_id'),
    secretVersion: integer('secret_version').notNull().default(1),
    redeliverySourceId: uuid('redelivery_source_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('webhook_deliveries_event_endpoint_idx').on(table.eventId, table.endpointId),
    index('webhook_deliveries_tenant_idx').on(table.tenantId),
    index('webhook_deliveries_status_idx').on(table.status),
    index('webhook_deliveries_next_attempt_idx').on(table.nextAttemptAt),
  ],
);

export const providerHealth = pgTable(
  'provider_health',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    providerType: varchar('provider_type', { length: 64 }).notNull(),
    providerId: uuid('provider_id'),
    status: providerHealthStatusEnum('status').notNull().default('unknown'),
    latencyMs: integer('latency_ms'),
    message: text('message'),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('provider_health_type_idx').on(table.providerType, table.providerId)],
);

export const platformApiTokens = pgTable(
  'platform_api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    tokenPrefix: varchar('token_prefix', { length: 16 }).notNull(),
    tokenHash: text('token_hash').notNull(),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    role: varchar('role', { length: 64 }).notNull().default('platform_super_admin'),
    scopes: jsonb('scopes').notNull().default(['*']),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default({}),
    rotatedFromTokenId: uuid('rotated_from_token_id'),
  },
  (table) => [
    index('platform_api_tokens_prefix_idx').on(table.tokenPrefix),
    uniqueIndex('platform_api_tokens_prefix_active_uidx').on(table.tokenPrefix),
    index('platform_api_tokens_status_idx').on(table.status),
  ],
);

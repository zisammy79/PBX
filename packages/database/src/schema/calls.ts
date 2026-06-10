import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { callDirectionEnum, callStatusEnum, recordingStatusEnum } from './enums';
import { tenants } from './tenants';

export const calls = pgTable(
  'calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    correlationId: uuid('correlation_id').notNull(),
    direction: callDirectionEnum('direction').notNull(),
    status: callStatusEnum('status').notNull().default('initiating'),
    callerNumber: varchar('caller_number', { length: 32 }),
    calleeNumber: varchar('callee_number', { length: 32 }),
    fromExtensionId: uuid('from_extension_id'),
    toExtensionId: uuid('to_extension_id'),
    trunkId: uuid('trunk_id'),
    aiAgentId: uuid('ai_agent_id'),
    asteriskChannelId: varchar('asterisk_channel_id', { length: 128 }),
    asteriskBridgeId: varchar('asterisk_bridge_id', { length: 128 }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationSeconds: integer('duration_seconds'),
    billableSeconds: integer('billable_seconds'),
    hangupCause: varchar('hangup_cause', { length: 64 }),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('calls_tenant_idx').on(table.tenantId),
    index('calls_correlation_idx').on(table.correlationId),
    index('calls_status_idx').on(table.status),
    index('calls_started_at_idx').on(table.startedAt),
  ],
);

export const callLegs = pgTable(
  'call_legs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    callId: uuid('call_id')
      .notNull()
      .references(() => calls.id, { onDelete: 'cascade' }),
    legType: varchar('leg_type', { length: 32 }).notNull(),
    channelId: varchar('channel_id', { length: 128 }),
    endpointId: varchar('endpoint_id', { length: 128 }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp('answered_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default({}),
  },
  (table) => [
    index('call_legs_call_idx').on(table.callId),
    index('call_legs_tenant_idx').on(table.tenantId),
  ],
);

export const callEvents = pgTable(
  'call_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    callId: uuid('call_id')
      .notNull()
      .references(() => calls.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    payload: jsonb('payload').notNull().default({}),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('call_events_call_idx').on(table.callId),
    index('call_events_tenant_idx').on(table.tenantId),
    index('call_events_type_idx').on(table.eventType),
  ],
);

export const callRecordings = pgTable(
  'call_recordings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    callId: uuid('call_id')
      .notNull()
      .references(() => calls.id, { onDelete: 'cascade' }),
    status: recordingStatusEnum('status').notNull().default('pending'),
    storageKey: varchar('storage_key', { length: 512 }),
    durationSeconds: integer('duration_seconds'),
    format: varchar('format', { length: 16 }).default('wav'),
    consentPolicyId: uuid('consent_policy_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    availableAt: timestamp('available_at', { withTimezone: true }),
  },
  (table) => [
    index('call_recordings_call_idx').on(table.callId),
    index('call_recordings_tenant_idx').on(table.tenantId),
  ],
);

export const transcripts = pgTable(
  'transcripts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    callId: uuid('call_id')
      .notNull()
      .references(() => calls.id, { onDelete: 'cascade' }),
    content: jsonb('content').notNull().default([]),
    language: varchar('language', { length: 16 }).default('en'),
    provider: varchar('provider', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('transcripts_call_idx').on(table.callId),
    index('transcripts_tenant_idx').on(table.tenantId),
  ],
);

export const carrierUsage = pgTable(
  'carrier_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    callId: uuid('call_id').references(() => calls.id),
    provider: varchar('provider', { length: 64 }).notNull(),
    providerAccount: varchar('provider_account', { length: 128 }),
    durationSeconds: integer('duration_seconds').notNull(),
    costAmount: numeric('cost_amount', { precision: 18, scale: 6 }),
    costCurrency: varchar('cost_currency', { length: 3 }).default('USD'),
    rawPayload: jsonb('raw_payload').notNull().default({}),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('carrier_usage_tenant_idx').on(table.tenantId)],
);

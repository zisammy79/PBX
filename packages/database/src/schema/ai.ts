import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { aiSessionStatusEnum } from './enums';
import { extensions } from './telephony';
import { tenants } from './tenants';
import { users } from './users';

export const aiProviderConnections = pgTable(
  'ai_provider_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    providerType: varchar('provider_type', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    credentialsEncrypted: text('credentials_encrypted').notNull(),
    credentialKeyVersion: varchar('credential_key_version', { length: 16 }).notNull().default('v1'),
    config: jsonb('config').notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    healthStatus: varchar('health_status', { length: 32 }).notNull().default('unknown'),
    validationStatus: varchar('validation_status', { length: 32 }).notNull().default('unknown'),
    lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
    validationError: text('validation_error'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ai_provider_connections_tenant_idx').on(table.tenantId)],
);

export const aiAgents = pgTable(
  'ai_agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    status: varchar('status', { length: 32 }).notNull().default('draft'),
    routeNumber: varchar('route_number', { length: 16 }),
    transferExtensionId: uuid('transfer_extension_id').references(() => extensions.id),
    activeVersionId: uuid('active_version_id'),
    isActive: boolean('is_active').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ai_agents_tenant_idx').on(table.tenantId),
    uniqueIndex('ai_agents_tenant_route_uidx').on(table.tenantId, table.routeNumber),
  ],
);

export const aiAgentVersions = pgTable(
  'ai_agent_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => aiAgents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    config: jsonb('config').notNull().default({}),
    pipelineType: varchar('pipeline_type', { length: 32 }).notNull().default('realtime'),
    providerConnectionId: uuid('provider_connection_id').references(() => aiProviderConnections.id),
    provider: varchar('provider', { length: 64 }),
    model: varchar('model', { length: 128 }),
    voice: varchar('voice', { length: 64 }),
    language: varchar('language', { length: 16 }).default('en'),
    systemInstructions: text('system_instructions'),
    openingMessage: text('opening_message'),
    interruptionConfig: jsonb('interruption_config').notNull().default({}),
    silenceTimeoutSeconds: integer('silence_timeout_seconds'),
    maxDurationSeconds: integer('max_duration_seconds'),
    allowedTools: jsonb('allowed_tools').notNull().default([]),
    recordingPolicy: varchar('recording_policy', { length: 32 }),
    transcriptionPolicy: varchar('transcription_policy', { length: 32 }),
    status: varchar('status', { length: 32 }).notNull().default('draft'),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('ai_agent_versions_uidx').on(table.agentId, table.version),
    index('ai_agent_versions_tenant_idx').on(table.tenantId),
  ],
);

export const aiTools = pgTable(
  'ai_tools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    toolType: varchar('tool_type', { length: 64 }).notNull(),
    jsonSchema: jsonb('json_schema').notNull(),
    config: jsonb('config').notNull().default({}),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('ai_tools_tenant_name_uidx').on(table.tenantId, table.name),
    index('ai_tools_tenant_idx').on(table.tenantId),
  ],
);

export const aiKnowledgeSources = pgTable(
  'ai_knowledge_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    sourceType: varchar('source_type', { length: 64 }).notNull(),
    config: jsonb('config').notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ai_knowledge_sources_tenant_idx').on(table.tenantId)],
);

export const aiSessions = pgTable(
  'ai_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    callId: uuid('call_id').notNull(),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => aiAgents.id),
    agentVersionId: uuid('agent_version_id')
      .notNull()
      .references(() => aiAgentVersions.id),
    providerConnectionId: uuid('provider_connection_id').references(() => aiProviderConnections.id),
    providerType: varchar('provider_type', { length: 64 }).notNull(),
    providerSessionId: varchar('provider_session_id', { length: 256 }),
    status: aiSessionStatusEnum('status').notNull().default('connecting'),
    state: varchar('state', { length: 32 }).notNull().default('CREATED'),
    correlationId: uuid('correlation_id').notNull(),
    diagnostics: jsonb('diagnostics').notNull().default({}),
    transferResult: jsonb('transfer_result').notNull().default({}),
    failureCategory: varchar('failure_category', { length: 64 }),
    timing: jsonb('timing').notNull().default({}),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [
    index('ai_sessions_call_idx').on(table.callId),
    index('ai_sessions_tenant_idx').on(table.tenantId),
    index('ai_sessions_correlation_idx').on(table.correlationId),
  ],
);

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => aiSessions.id),
    callId: uuid('call_id'),
    provider: varchar('provider', { length: 64 }).notNull(),
    meterName: varchar('meter_name', { length: 64 }).notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 6 }).notNull(),
    unit: varchar('unit', { length: 32 }).notNull(),
    measurementSource: varchar('measurement_source', { length: 32 }).notNull().default('PLATFORM_MEASURED'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    providerEventId: varchar('provider_event_id', { length: 256 }),
    correlationId: uuid('correlation_id'),
    costAmount: numeric('cost_amount', { precision: 18, scale: 6 }),
    costCurrency: varchar('cost_currency', { length: 3 }).default('USD'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('ai_usage_tenant_idx').on(table.tenantId),
    uniqueIndex('ai_usage_idempotency_uidx').on(table.idempotencyKey),
  ],
);

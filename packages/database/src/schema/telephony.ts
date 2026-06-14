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
import { extensionStatusEnum, sipTransportEnum } from './enums';
import { tenants } from './tenants';
import { users } from './users';

export const extensions = pgTable(
  'extensions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    extensionNumber: varchar('extension_number', { length: 16 }).notNull(),
    displayName: varchar('display_name', { length: 255 }).notNull(),
    userId: uuid('user_id').references(() => users.id),
    status: extensionStatusEnum('status').notNull().default('active'),
    asteriskEndpointId: varchar('asterisk_endpoint_id', { length: 128 }).notNull(),
    voicemailEnabled: boolean('voicemail_enabled').notNull().default(false),
    recordingPolicy: jsonb('recording_policy').notNull().default({}),
    recordingPolicyMode: varchar('recording_policy_mode', { length: 16 }).notNull().default('inherit'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('extensions_tenant_number_uidx').on(table.tenantId, table.extensionNumber),
    uniqueIndex('extensions_asterisk_endpoint_uidx').on(table.asteriskEndpointId),
    index('extensions_tenant_idx').on(table.tenantId),
  ],
);

export const sipCredentials = pgTable(
  'sip_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    extensionId: uuid('extension_id')
      .notNull()
      .references(() => extensions.id, { onDelete: 'cascade' }),
    username: varchar('username', { length: 128 }).notNull(),
    secretEncrypted: text('secret_encrypted').notNull(),
    secretVersion: integer('secret_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('sip_credentials_username_uidx').on(table.username),
    index('sip_credentials_tenant_idx').on(table.tenantId),
    index('sip_credentials_extension_idx').on(table.extensionId),
  ],
);

export const sipRegistrations = pgTable(
  'sip_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    extensionId: uuid('extension_id')
      .notNull()
      .references(() => extensions.id, { onDelete: 'cascade' }),
    contact: text('contact'),
    userAgent: text('user_agent'),
    sourceIp: varchar('source_ip', { length: 45 }),
    registeredAt: timestamp('registered_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    isRegistered: boolean('is_registered').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sip_registrations_extension_uidx').on(table.extensionId),
    index('sip_registrations_tenant_idx').on(table.tenantId),
  ],
);

export const sipTrunks = pgTable(
  'sip_trunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 63 }).notNull(),
    providerAdapter: varchar('provider_adapter', { length: 64 }).notNull().default('generic'),
    authMode: varchar('auth_mode', { length: 32 }).notNull().default('registration'),
    transport: sipTransportEnum('transport').notNull().default('udp'),
    asteriskTrunkId: varchar('asterisk_trunk_id', { length: 128 }).notNull(),
    config: jsonb('config').notNull().default({}),
    credentialsEncrypted: text('credentials_encrypted'),
    isActive: boolean('is_active').notNull().default(false),
    healthStatus: varchar('health_status', { length: 32 }).notNull().default('unknown'),
    lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sip_trunks_tenant_slug_uidx').on(table.tenantId, table.slug),
    uniqueIndex('sip_trunks_asterisk_id_uidx').on(table.asteriskTrunkId),
    index('sip_trunks_tenant_idx').on(table.tenantId),
  ],
);

export const sipTrunkEndpoints = pgTable(
  'sip_trunk_endpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    trunkId: uuid('trunk_id')
      .notNull()
      .references(() => sipTrunks.id, { onDelete: 'cascade' }),
    host: varchar('host', { length: 255 }).notNull(),
    port: integer('port').notNull().default(5060),
    priority: integer('priority').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sip_trunk_endpoints_trunk_idx').on(table.trunkId)],
);

export const phoneNumbers = pgTable(
  'phone_numbers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    e164: varchar('e164', { length: 20 }).notNull(),
    friendlyName: varchar('friendly_name', { length: 255 }),
    trunkId: uuid('trunk_id').references(() => sipTrunks.id),
    inboundRouteId: uuid('inbound_route_id'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('phone_numbers_e164_uidx').on(table.e164),
    index('phone_numbers_tenant_idx').on(table.tenantId),
  ],
);

export const inboundRoutes = pgTable(
  'inbound_routes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    didPattern: varchar('did_pattern', { length: 64 }).notNull(),
    destinationType: varchar('destination_type', { length: 64 }).notNull(),
    destinationId: uuid('destination_id'),
    priority: integer('priority').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('inbound_routes_tenant_idx').on(table.tenantId)],
);

export const outboundRoutes = pgTable(
  'outbound_routes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    pattern: varchar('pattern', { length: 64 }).notNull(),
    trunkId: uuid('trunk_id').references(() => sipTrunks.id),
    callerIdPolicy: jsonb('caller_id_policy').notNull().default({}),
    priority: integer('priority').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('outbound_routes_tenant_idx').on(table.tenantId)],
);

export const ringGroups = pgTable(
  'ring_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    strategy: varchar('strategy', { length: 32 }).notNull().default('simultaneous'),
    timeoutSeconds: integer('timeout_seconds').notNull().default(30),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ring_groups_tenant_idx').on(table.tenantId)],
);

export const ringGroupMembers = pgTable(
  'ring_group_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    ringGroupId: uuid('ring_group_id')
      .notNull()
      .references(() => ringGroups.id, { onDelete: 'cascade' }),
    extensionId: uuid('extension_id')
      .notNull()
      .references(() => extensions.id, { onDelete: 'cascade' }),
    priority: integer('priority').notNull().default(1),
  },
  (table) => [
    uniqueIndex('ring_group_members_uidx').on(table.ringGroupId, table.extensionId),
    index('ring_group_members_tenant_idx').on(table.tenantId),
  ],
);

export const queues = pgTable(
  'queues',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    asteriskQueueName: varchar('asterisk_queue_name', { length: 128 }).notNull(),
    strategy: varchar('strategy', { length: 32 }).notNull().default('ringall'),
    maxWaitSeconds: integer('max_wait_seconds').notNull().default(300),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('queues_asterisk_name_uidx').on(table.asteriskQueueName),
    index('queues_tenant_idx').on(table.tenantId),
  ],
);

export const queueMembers = pgTable(
  'queue_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    queueId: uuid('queue_id')
      .notNull()
      .references(() => queues.id, { onDelete: 'cascade' }),
    extensionId: uuid('extension_id')
      .notNull()
      .references(() => extensions.id, { onDelete: 'cascade' }),
    penalty: integer('penalty').notNull().default(0),
  },
  (table) => [
    uniqueIndex('queue_members_uidx').on(table.queueId, table.extensionId),
    index('queue_members_tenant_idx').on(table.tenantId),
  ],
);

export const ivrs = pgTable(
  'ivrs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    greetingAudioKey: varchar('greeting_audio_key', { length: 512 }),
    timeoutSeconds: integer('timeout_seconds').notNull().default(10),
    maxRetries: integer('max_retries').notNull().default(3),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('ivrs_tenant_idx').on(table.tenantId)],
);

export const ivrOptions = pgTable(
  'ivr_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    ivrId: uuid('ivr_id')
      .notNull()
      .references(() => ivrs.id, { onDelete: 'cascade' }),
    digit: varchar('digit', { length: 2 }).notNull(),
    destinationType: varchar('destination_type', { length: 64 }).notNull(),
    destinationId: uuid('destination_id'),
  },
  (table) => [
    uniqueIndex('ivr_options_uidx').on(table.ivrId, table.digit),
    index('ivr_options_tenant_idx').on(table.tenantId),
  ],
);

export const businessSchedules = pgTable(
  'business_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    timezone: varchar('timezone', { length: 64 }).notNull().default('UTC'),
    rules: jsonb('rules').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('business_schedules_tenant_idx').on(table.tenantId)],
);

export const callFlows = pgTable(
  'call_flows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    activeVersionId: uuid('active_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('call_flows_tenant_idx').on(table.tenantId)],
);

export const callFlowVersions = pgTable(
  'call_flow_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    callFlowId: uuid('call_flow_id')
      .notNull()
      .references(() => callFlows.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    definition: jsonb('definition').notNull(),
    compiledConfig: text('compiled_config'),
    status: varchar('status', { length: 32 }).notNull().default('draft'),
    createdBy: uuid('created_by').references(() => users.id),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('call_flow_versions_uidx').on(table.callFlowId, table.version),
    index('call_flow_versions_tenant_idx').on(table.tenantId),
  ],
);

export const voicemails = pgTable(
  'voicemails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    extensionId: uuid('extension_id')
      .notNull()
      .references(() => extensions.id, { onDelete: 'cascade' }),
    callerNumber: varchar('caller_number', { length: 32 }),
    durationSeconds: integer('duration_seconds').notNull(),
    storageKey: varchar('storage_key', { length: 512 }).notNull(),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('voicemails_tenant_idx').on(table.tenantId)],
);

export const sipDevices = pgTable(
  'sip_devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    extensionId: uuid('extension_id')
      .notNull()
      .references(() => extensions.id, { onDelete: 'cascade' }),
    sipCredentialId: uuid('sip_credential_id').references(() => sipCredentials.id, {
      onDelete: 'set null',
    }),
    deviceType: varchar('device_type', { length: 32 }).notNull().default('legacy'),
    friendlyName: varchar('friendly_name', { length: 255 }).notNull(),
    status: varchar('status', { length: 32 }).notNull().default('active'),
    provisioningStatus: varchar('provisioning_status', { length: 32 }).notNull().default('ready'),
    asteriskEndpointId: varchar('asterisk_endpoint_id', { length: 128 }),
    metadata: jsonb('metadata').notNull().default({}),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('sip_devices_tenant_idx').on(table.tenantId),
    index('sip_devices_extension_idx').on(table.extensionId),
  ],
);

export const tenantSipDomains = pgTable(
  'tenant_sip_domains',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    domain: varchar('domain', { length: 255 }).notNull(),
    mode: varchar('mode', { length: 32 }).notNull().default('tenant_domain'),
    validationStatus: varchar('validation_status', { length: 32 }).notNull().default('pending'),
    activationStatus: varchar('activation_status', { length: 32 }).notNull().default('inactive'),
    dnsValidationToken: varchar('dns_validation_token', { length: 128 }),
    verificationTokenHash: varchar('verification_token_hash', { length: 128 }),
    dnsObservedAt: timestamp('dns_observed_at', { withTimezone: true }),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('tenant_sip_domains_domain_uidx').on(table.domain),
    index('tenant_sip_domains_tenant_idx').on(table.tenantId),
  ],
);

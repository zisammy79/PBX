import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    actorType: varchar('actor_type', { length: 32 }).notNull(),
    action: varchar('action', { length: 128 }).notNull(),
    resourceType: varchar('resource_type', { length: 64 }).notNull(),
    resourceId: uuid('resource_id'),
    correlationId: uuid('correlation_id'),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_events_tenant_idx').on(table.tenantId),
    index('audit_events_actor_idx').on(table.actorUserId),
    index('audit_events_action_idx').on(table.action),
    index('audit_events_created_idx').on(table.createdAt),
  ],
);

export const securityEvents = pgTable(
  'security_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    eventType: varchar('event_type', { length: 64 }).notNull(),
    severity: varchar('severity', { length: 16 }).notNull().default('info'),
    sourceIp: varchar('source_ip', { length: 45 }),
    userId: uuid('user_id').references(() => users.id),
    details: jsonb('details').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('security_events_tenant_idx').on(table.tenantId),
    index('security_events_type_idx').on(table.eventType),
    index('security_events_created_idx').on(table.createdAt),
  ],
);

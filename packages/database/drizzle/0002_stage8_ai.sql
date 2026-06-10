-- Stage 8: AI voice vertical slice schema enhancements and RLS

ALTER TABLE "ai_provider_connections" ADD COLUMN IF NOT EXISTS "credential_key_version" varchar(16) DEFAULT 'v1' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_provider_connections" ADD COLUMN IF NOT EXISTS "validation_status" varchar(32) DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_provider_connections" ADD COLUMN IF NOT EXISTS "last_validated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai_provider_connections" ADD COLUMN IF NOT EXISTS "validation_error" text;--> statement-breakpoint
ALTER TABLE "ai_provider_connections" ADD COLUMN IF NOT EXISTS "created_by" uuid;--> statement-breakpoint

ALTER TABLE "ai_agents" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_agents" ADD COLUMN IF NOT EXISTS "route_number" varchar(16);--> statement-breakpoint
ALTER TABLE "ai_agents" ADD COLUMN IF NOT EXISTS "transfer_extension_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_agents" ADD COLUMN IF NOT EXISTS "created_by" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_agents_tenant_route_uidx" ON "ai_agents" ("tenant_id", "route_number") WHERE "route_number" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "ai_agent_versions" ADD COLUMN IF NOT EXISTS "provider_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD COLUMN IF NOT EXISTS "provider" varchar(64);--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD COLUMN IF NOT EXISTS "model" varchar(128);--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD COLUMN IF NOT EXISTS "voice" varchar(64);--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD COLUMN IF NOT EXISTS "language" varchar(16) DEFAULT 'en';--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD COLUMN IF NOT EXISTS "system_instructions" text;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD COLUMN IF NOT EXISTS "opening_message" text;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD COLUMN IF NOT EXISTS "interruption_config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD COLUMN IF NOT EXISTS "silence_timeout_seconds" integer;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD COLUMN IF NOT EXISTS "max_duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD COLUMN IF NOT EXISTS "allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD COLUMN IF NOT EXISTS "recording_policy" varchar(32);--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD COLUMN IF NOT EXISTS "transcription_policy" varchar(32);--> statement-breakpoint
ALTER TABLE "ai_agent_versions" ADD COLUMN IF NOT EXISTS "created_by" uuid;--> statement-breakpoint

ALTER TABLE "ai_sessions" ADD COLUMN IF NOT EXISTS "provider_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD COLUMN IF NOT EXISTS "provider_session_id" varchar(256);--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD COLUMN IF NOT EXISTS "correlation_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD COLUMN IF NOT EXISTS "transfer_result" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD COLUMN IF NOT EXISTS "failure_category" varchar(64);--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD COLUMN IF NOT EXISTS "timing" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD COLUMN IF NOT EXISTS "state" varchar(32) DEFAULT 'CREATED' NOT NULL;--> statement-breakpoint

ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(128);--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "measurement_source" varchar(32) DEFAULT 'PLATFORM_MEASURED' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "correlation_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "provider_event_id" varchar(256);--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN IF NOT EXISTS "call_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_usage_idempotency_uidx" ON "ai_usage" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint

ALTER TYPE "ai_session_status" ADD VALUE IF NOT EXISTS 'listening';--> statement-breakpoint
ALTER TYPE "ai_session_status" ADD VALUE IF NOT EXISTS 'responding';--> statement-breakpoint
ALTER TYPE "ai_session_status" ADD VALUE IF NOT EXISTS 'interrupted';--> statement-breakpoint
ALTER TYPE "ai_session_status" ADD VALUE IF NOT EXISTS 'tool_pending';--> statement-breakpoint
ALTER TYPE "ai_session_status" ADD VALUE IF NOT EXISTS 'transferred';--> statement-breakpoint

ALTER TABLE "ai_provider_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_provider_connections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "ai_provider_connections_tenant_all" ON "ai_provider_connections";--> statement-breakpoint
CREATE POLICY "ai_provider_connections_tenant_all" ON "ai_provider_connections"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "ai_agent_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_agent_versions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_agent_versions_tenant_all" ON "ai_agent_versions"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "ai_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_sessions_tenant_all" ON "ai_sessions"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "ai_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_usage" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_usage_tenant_all" ON "ai_usage"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "ai_tools" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_tools" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_tools_tenant_all" ON "ai_tools"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "ai_knowledge_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_knowledge_sources" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_knowledge_sources_tenant_all" ON "ai_knowledge_sources"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));

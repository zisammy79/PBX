-- Slice F: API keys lineage, platform events, idempotency, webhook delivery metadata

ALTER TABLE "api_applications" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint

ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "rotated_from_key_id" uuid;--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_prefix_active_uidx" ON "api_keys" ("key_prefix");--> statement-breakpoint

ALTER TABLE "webhook_endpoints" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN IF NOT EXISTS "secret_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN IF NOT EXISTS "last_successful_delivery_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN IF NOT EXISTS "last_failed_delivery_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD COLUMN IF NOT EXISTS "failure_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "error_category" varchar(32);--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "correlation_id" uuid;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "secret_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN IF NOT EXISTS "redelivery_source_id" uuid;--> statement-breakpoint
DROP INDEX IF EXISTS "webhook_deliveries_event_endpoint_uidx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_deliveries_event_endpoint_idx" ON "webhook_deliveries" ("event_id", "endpoint_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_deliveries_initial_uidx" ON "webhook_deliveries" ("event_id", "endpoint_id") WHERE "redelivery_source_id" IS NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "event_type" varchar(64) NOT NULL,
  "api_version" varchar(8) DEFAULT 'v1' NOT NULL,
  "correlation_id" uuid,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_events_tenant_idx" ON "platform_events" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_events_type_idx" ON "platform_events" ("event_type");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "idempotency_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "route_key" varchar(128) NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "request_hash" varchar(64) NOT NULL,
  "response_status" integer NOT NULL,
  "response_body" jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_records_uidx" ON "idempotency_records" ("tenant_id", "route_key", "idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idempotency_records_expires_idx" ON "idempotency_records" ("expires_at");--> statement-breakpoint

ALTER TABLE "platform_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "platform_events_tenant_all" ON "platform_events"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "idempotency_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "idempotency_records" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "idempotency_records_tenant_all" ON "idempotency_records"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "webhook_endpoints" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "webhook_endpoints_tenant_all" ON "webhook_endpoints"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "webhook_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "webhook_deliveries_tenant_all" ON "webhook_deliveries"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "api_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_applications" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "api_applications_tenant_all" ON "api_applications"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));

-- Phase 6: campaigns foundation, telephony cron jobs, voicemail RLS

ALTER TABLE "voicemails" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "voicemails" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "voicemails_tenant_all" ON "voicemails"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "technology" varchar(16) DEFAULT 'voice' NOT NULL,
  "status" varchar(32) DEFAULT 'draft' NOT NULL,
  "max_concurrent" integer DEFAULT 1 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaigns_tenant_idx" ON "campaigns" USING btree ("tenant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "campaign_numbers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "number" varchar(64) NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_status" varchar(32),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_numbers_campaign_number_uidx" ON "campaign_numbers" ("campaign_id", "number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_numbers_tenant_idx" ON "campaign_numbers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_numbers_campaign_idx" ON "campaign_numbers" USING btree ("campaign_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "telephony_cron_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "job_type" varchar(64) NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "schedule" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
  "last_started_at" timestamp with time zone,
  "last_ended_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telephony_cron_jobs_tenant_idx" ON "telephony_cron_jobs" USING btree ("tenant_id");--> statement-breakpoint

ALTER TABLE "campaigns" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaigns" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "campaigns_tenant_all" ON "campaigns"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "campaign_numbers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campaign_numbers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "campaign_numbers_tenant_all" ON "campaign_numbers"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "telephony_cron_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "telephony_cron_jobs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "telephony_cron_jobs_tenant_all" ON "telephony_cron_jobs"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));

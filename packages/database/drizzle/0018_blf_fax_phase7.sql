-- Phase 7: button layouts / BLF provisioning, fax foundation, SMS messages stub

CREATE TABLE IF NOT EXISTS "button_layouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "vendor_template" varchar(64) DEFAULT 'generic' NOT NULL,
  "code" varchar(32),
  "line_start" integer DEFAULT 1 NOT NULL,
  "line_end" integer DEFAULT 10 NOT NULL,
  "buttons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "button_layouts_tenant_name_uidx" ON "button_layouts" ("tenant_id", "name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "button_layouts_tenant_idx" ON "button_layouts" USING btree ("tenant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "button_layout_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "layout_id" uuid NOT NULL REFERENCES "button_layouts"("id") ON DELETE CASCADE,
  "device_id" uuid REFERENCES "sip_devices"("id") ON DELETE CASCADE,
  "extension_id" uuid REFERENCES "extensions"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "button_layout_assignments_tenant_idx" ON "button_layout_assignments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "button_layout_assignments_layout_idx" ON "button_layout_assignments" USING btree ("layout_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "faxes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "direction" varchar(16) NOT NULL,
  "remote_number" varchar(64) NOT NULL,
  "local_number" varchar(64) NOT NULL,
  "status" varchar(32) DEFAULT 'queued' NOT NULL,
  "pages" integer DEFAULT 0 NOT NULL,
  "storage_key" varchar(512),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "faxes_tenant_idx" ON "faxes" USING btree ("tenant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sms_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "campaigns"("id") ON DELETE SET NULL,
  "direction" varchar(16) NOT NULL,
  "from_number" varchar(64) NOT NULL,
  "to_number" varchar(64) NOT NULL,
  "body" text NOT NULL,
  "status" varchar(32) DEFAULT 'queued' NOT NULL,
  "provider_message_id" varchar(128),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sms_messages_tenant_idx" ON "sms_messages" USING btree ("tenant_id");--> statement-breakpoint

ALTER TABLE "button_layouts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "button_layouts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "button_layouts_tenant_all" ON "button_layouts"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "button_layout_assignments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "button_layout_assignments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "button_layout_assignments_tenant_all" ON "button_layout_assignments"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "faxes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "faxes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "faxes_tenant_all" ON "faxes"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "sms_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sms_messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sms_messages_tenant_all" ON "sms_messages"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));

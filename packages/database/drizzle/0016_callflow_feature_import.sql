-- Phase 0-2: 1com callflow feature import foundation

CREATE TABLE IF NOT EXISTS "media_files" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "format" varchar(32) NOT NULL,
  "size_bytes" integer NOT NULL,
  "md5" varchar(32) NOT NULL,
  "storage_key" varchar(512) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_files_tenant_idx" ON "media_files" USING btree ("tenant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "moh_classes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "media_file_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "randomize" boolean DEFAULT false NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "moh_classes_tenant_idx" ON "moh_classes" USING btree ("tenant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "feature_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "code" varchar(16) NOT NULL,
  "description" text,
  "action_type" varchar(64) NOT NULL,
  "action_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "feature_codes_tenant_code_uidx" ON "feature_codes" ("tenant_id", "code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "feature_codes_tenant_idx" ON "feature_codes" USING btree ("tenant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "blacklist_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "number_pattern" varchar(64) NOT NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blacklist_entries_tenant_idx" ON "blacklist_entries" USING btree ("tenant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "short_numbers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "short_code" varchar(16) NOT NULL,
  "destination_type" varchar(64) NOT NULL,
  "destination_value" varchar(255) NOT NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "short_numbers_tenant_code_uidx" ON "short_numbers" ("tenant_id", "short_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "short_numbers_tenant_idx" ON "short_numbers" USING btree ("tenant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "custom_destinations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "destination_type" varchar(64) NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "custom_destinations_tenant_idx" ON "custom_destinations" USING btree ("tenant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "conferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "number" varchar(16) NOT NULL,
  "pin" varchar(32),
  "admin_pin" varchar(32),
  "max_participants" integer DEFAULT 10 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conferences_tenant_number_uidx" ON "conferences" ("tenant_id", "number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conferences_tenant_idx" ON "conferences" USING btree ("tenant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "paging_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "number" varchar(16) NOT NULL,
  "bidirectional" boolean DEFAULT false NOT NULL,
  "member_extension_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "paging_groups_tenant_idx" ON "paging_groups" USING btree ("tenant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "phonebook_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "book_name" varchar(128) DEFAULT 'default' NOT NULL,
  "display_name" varchar(255) NOT NULL,
  "number" varchar(64) NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "phonebook_entries_tenant_idx" ON "phonebook_entries" USING btree ("tenant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "dnc_lists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "description" text,
  "list_type" varchar(32) DEFAULT 'dnc' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dnc_lists_tenant_idx" ON "dnc_lists" USING btree ("tenant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "dnc_list_numbers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "list_id" uuid NOT NULL REFERENCES "dnc_lists"("id") ON DELETE CASCADE,
  "number" varchar(64) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "dnc_list_numbers_list_number_uidx" ON "dnc_list_numbers" ("list_id", "number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dnc_list_numbers_tenant_idx" ON "dnc_list_numbers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dnc_list_numbers_list_idx" ON "dnc_list_numbers" USING btree ("list_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_locale_packs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "locale" varchar(8) NOT NULL,
  "label" varchar(255) NOT NULL,
  "direction" varchar(3) DEFAULT 'ltr' NOT NULL,
  "messages" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_locale_packs_locale_uidx" ON "platform_locale_packs" ("locale");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_holiday_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(255) NOT NULL,
  "timezone" varchar(64) DEFAULT 'Asia/Jerusalem' NOT NULL,
  "rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_holiday_templates_name_idx" ON "platform_holiday_templates" USING btree ("name");--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferred_locale" varchar(8) DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "queues" ADD COLUMN IF NOT EXISTS "number" varchar(16);--> statement-breakpoint
ALTER TABLE "queues" ADD COLUMN IF NOT EXISTS "record_always" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "queues" ADD COLUMN IF NOT EXISTS "moh_class_id" uuid REFERENCES "moh_classes"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "ivrs" ADD COLUMN IF NOT EXISTS "allow_dial_extensions" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ivrs" ADD COLUMN IF NOT EXISTS "allow_feature_codes" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ivrs" ADD COLUMN IF NOT EXISTS "language" varchar(8) DEFAULT 'he' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_schedules" ADD COLUMN IF NOT EXISTS "schedule_type" varchar(32) DEFAULT 'weektime' NOT NULL;--> statement-breakpoint
ALTER TABLE "business_schedules" ADD COLUMN IF NOT EXISTS "open_destination_type" varchar(64);--> statement-breakpoint
ALTER TABLE "business_schedules" ADD COLUMN IF NOT EXISTS "open_destination_id" uuid;--> statement-breakpoint
ALTER TABLE "business_schedules" ADD COLUMN IF NOT EXISTS "closed_destination_type" varchar(64);--> statement-breakpoint
ALTER TABLE "business_schedules" ADD COLUMN IF NOT EXISTS "closed_destination_id" uuid;--> statement-breakpoint

INSERT INTO "platform_locale_packs" ("locale", "label", "direction", "messages", "version")
VALUES
  ('he', 'עברית', 'rtl', '{}'::jsonb, 1),
  ('en', 'English', 'ltr', '{}'::jsonb, 1),
  ('fr', 'Français', 'ltr', '{}'::jsonb, 1)
ON CONFLICT ("locale") DO NOTHING;--> statement-breakpoint

ALTER TABLE "media_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media_files" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "media_files_tenant_all" ON "media_files"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "moh_classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "moh_classes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "moh_classes_tenant_all" ON "moh_classes"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "feature_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "feature_codes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "feature_codes_tenant_all" ON "feature_codes"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "blacklist_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "blacklist_entries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "blacklist_entries_tenant_all" ON "blacklist_entries"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "short_numbers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "short_numbers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "short_numbers_tenant_all" ON "short_numbers"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "custom_destinations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "custom_destinations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "custom_destinations_tenant_all" ON "custom_destinations"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "conferences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conferences" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "conferences_tenant_all" ON "conferences"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "paging_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "paging_groups" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "paging_groups_tenant_all" ON "paging_groups"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "phonebook_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "phonebook_entries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "phonebook_entries_tenant_all" ON "phonebook_entries"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "dnc_lists" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dnc_lists" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "dnc_lists_tenant_all" ON "dnc_lists"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint

ALTER TABLE "dnc_list_numbers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "dnc_list_numbers" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "dnc_list_numbers_tenant_all" ON "dnc_list_numbers"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));

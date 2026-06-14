ALTER TABLE "extensions" ADD COLUMN IF NOT EXISTS "recording_policy_mode" varchar(16) DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'extensions_recording_policy_mode_check'
  ) THEN
    ALTER TABLE "extensions" ADD CONSTRAINT "extensions_recording_policy_mode_check" CHECK ("recording_policy_mode" IN ('inherit', 'on', 'off'));
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN IF NOT EXISTS "storage_backend" varchar(32) DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN IF NOT EXISTS "mime_type" varchar(64);--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN IF NOT EXISTS "file_size_bytes" bigint;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN IF NOT EXISTS "duration_ms" integer;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN IF NOT EXISTS "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN IF NOT EXISTS "failure_code" varchar(64);--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN IF NOT EXISTS "failure_message" text;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "call_recordings_tenant_status_idx" ON "call_recordings" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "call_recordings_call_uidx" ON "call_recordings" USING btree ("call_id");

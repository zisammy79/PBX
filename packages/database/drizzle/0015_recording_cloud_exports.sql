CREATE TABLE IF NOT EXISTS "recording_cloud_exports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "recording_id" uuid NOT NULL REFERENCES "call_recordings"("id") ON DELETE CASCADE,
  "connection_id" uuid NOT NULL REFERENCES "integration_connections"("id") ON DELETE CASCADE,
  "provider" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'pending',
  "cloud_file_id" varchar(512),
  "cloud_file_path" varchar(1024),
  "cloud_file_url" text,
  "error_code" varchar(64),
  "error_message" text,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "last_attempt_at" timestamp with time zone,
  "exported_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recording_cloud_exports_recording_conn_uidx" ON "recording_cloud_exports" USING btree ("recording_id","connection_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recording_cloud_exports_tenant_idx" ON "recording_cloud_exports" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recording_cloud_exports_status_idx" ON "recording_cloud_exports" USING btree ("status");

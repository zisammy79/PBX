-- Membership lifecycle columns (backward-compatible defaults)
ALTER TABLE "tenant_memberships" ADD COLUMN IF NOT EXISTS "status" varchar(32) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD COLUMN IF NOT EXISTS "invited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD COLUMN IF NOT EXISTS "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD COLUMN IF NOT EXISTS "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
UPDATE "tenant_memberships" SET "accepted_at" = COALESCE("accepted_at", "created_at") WHERE "status" = 'active';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_memberships_status_idx" ON "tenant_memberships" USING btree ("tenant_id", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "email" varchar(320) NOT NULL,
  "role" varchar(64) NOT NULL,
  "token_hash" varchar(128) NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "delivery_status" varchar(32) DEFAULT 'delivery_pending' NOT NULL,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_invitations_tenant_idx" ON "tenant_invitations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_invitations_email_idx" ON "tenant_invitations" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_invitations_token_hash_uidx" ON "tenant_invitations" ("token_hash");--> statement-breakpoint
ALTER TABLE "sip_devices" ADD COLUMN IF NOT EXISTS "provisioning_status" varchar(32) DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "sip_devices" ADD COLUMN IF NOT EXISTS "asterisk_endpoint_id" varchar(128);--> statement-breakpoint
ALTER TABLE "sip_devices" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_sip_domains" ADD COLUMN IF NOT EXISTS "mode" varchar(32) DEFAULT 'tenant_domain' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_sip_domains" ADD COLUMN IF NOT EXISTS "dns_observed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_sip_domains" ADD COLUMN IF NOT EXISTS "validated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_sip_domains" ADD COLUMN IF NOT EXISTS "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_sip_domains" ADD COLUMN IF NOT EXISTS "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_sip_domains" ADD COLUMN IF NOT EXISTS "failure_reason" text;--> statement-breakpoint
ALTER TABLE "tenant_sip_domains" ADD COLUMN IF NOT EXISTS "verification_token_hash" varchar(128);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_limit_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "dimension" varchar(64) NOT NULL,
  "limit_value" numeric(18, 6) NOT NULL,
  "reason" text,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_limit_overrides_uidx" ON "tenant_limit_overrides" ("tenant_id", "dimension");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_limit_overrides_tenant_idx" ON "tenant_limit_overrides" USING btree ("tenant_id");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'tenant_status' AND e.enumlabel = 'draft'
  ) THEN
    ALTER TYPE tenant_status ADD VALUE 'draft';
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'tenant_status' AND e.enumlabel = 'archived'
  ) THEN
    ALTER TYPE tenant_status ADD VALUE 'archived';
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'tenant_status' AND e.enumlabel = 'failed'
  ) THEN
    ALTER TYPE tenant_status ADD VALUE 'failed';
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sip_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "extension_id" uuid NOT NULL REFERENCES "extensions"("id") ON DELETE CASCADE,
  "sip_credential_id" uuid REFERENCES "sip_credentials"("id") ON DELETE SET NULL,
  "device_type" varchar(32) DEFAULT 'legacy' NOT NULL,
  "friendly_name" varchar(255) NOT NULL,
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "last_seen_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sip_devices_tenant_idx" ON "sip_devices" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sip_devices_extension_idx" ON "sip_devices" USING btree ("extension_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sip_devices_legacy_extension_uidx" ON "sip_devices" ("extension_id") WHERE "device_type" = 'legacy';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_sip_domains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "domain" varchar(255) NOT NULL,
  "validation_status" varchar(32) DEFAULT 'pending' NOT NULL,
  "activation_status" varchar(32) DEFAULT 'inactive' NOT NULL,
  "dns_validation_token" varchar(128),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_sip_domains_domain_uidx" ON "tenant_sip_domains" ("domain");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tenant_sip_domains_tenant_idx" ON "tenant_sip_domains" USING btree ("tenant_id");

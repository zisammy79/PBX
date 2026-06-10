-- Slice D: billing rating, invoice idempotency, price versioning

ALTER TABLE "prices" ADD COLUMN IF NOT EXISTS "effective_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN IF NOT EXISTS "effective_to" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN IF NOT EXISTS "pricing_model" varchar(32) DEFAULT 'PER_UNIT' NOT NULL;--> statement-breakpoint
ALTER TABLE "prices" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "prices" SET "effective_from" = COALESCE("created_at", NOW()) WHERE "effective_from" IS NULL;--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "effective_from" SET DEFAULT NOW();--> statement-breakpoint
ALTER TABLE "prices" ALTER COLUMN "effective_from" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "rated_usage" ADD COLUMN IF NOT EXISTS "provider_cost_status" varchar(32) DEFAULT 'UNAVAILABLE' NOT NULL;--> statement-breakpoint
ALTER TABLE "rated_usage" ADD COLUMN IF NOT EXISTS "rating_status" varchar(32) DEFAULT 'rated' NOT NULL;--> statement-breakpoint
ALTER TABLE "rated_usage" ADD COLUMN IF NOT EXISTS "price_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rated_usage_event_uidx" ON "rated_usage" ("usage_event_id");--> statement-breakpoint

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(128);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "credit_applied" numeric(18, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "subscription_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tax_rate" numeric(8, 6);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "tax_inclusive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "finalized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_idempotency_uidx" ON "invoices" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_tenant_period_finalized_uidx" ON "invoices" ("tenant_id", "period_start", "period_end") WHERE "status" IN ('finalized', 'open', 'paid');--> statement-breakpoint

ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "line_type" varchar(32) DEFAULT 'usage' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD COLUMN IF NOT EXISTS "snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tenant_billing_profiles" (
  "tenant_id" uuid PRIMARY KEY REFERENCES "tenants"("id") ON DELETE CASCADE,
  "billing_currency" varchar(3) DEFAULT 'USD' NOT NULL,
  "tax_rate" numeric(8, 6) DEFAULT '0.20' NOT NULL,
  "tax_inclusive" boolean DEFAULT false NOT NULL,
  "tax_effective_from" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);--> statement-breakpoint

ALTER TABLE "tenant_billing_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_billing_profiles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_billing_profiles_tenant_all" ON "tenant_billing_profiles";--> statement-breakpoint
CREATE POLICY "tenant_billing_profiles_tenant_all" ON "tenant_billing_profiles"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));

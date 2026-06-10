-- Production V1: Stripe test-mode mappings and webhook idempotency
ALTER TABLE tenant_billing_profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id varchar(128),
  ADD COLUMN IF NOT EXISTS stripe_mode varchar(16) NOT NULL DEFAULT 'DISABLED',
  ADD COLUMN IF NOT EXISTS stripe_publishable_key varchar(256);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  stripe_event_id varchar(128) NOT NULL,
  event_type varchar(128) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  processed_at timestamptz NOT NULL DEFAULT now(),
  idempotency_key varchar(128) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'processed'
);

CREATE UNIQUE INDEX IF NOT EXISTS stripe_webhook_events_event_uidx ON stripe_webhook_events(stripe_event_id);
CREATE UNIQUE INDEX IF NOT EXISTS stripe_webhook_events_idempotency_uidx ON stripe_webhook_events(idempotency_key);
CREATE INDEX IF NOT EXISTS stripe_webhook_events_tenant_idx ON stripe_webhook_events(tenant_id);

CREATE TABLE IF NOT EXISTS stripe_reconciliation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  internal_total numeric(18,2) NOT NULL,
  stripe_total numeric(18,2) NOT NULL,
  currency varchar(3) NOT NULL DEFAULT 'USD',
  matched boolean NOT NULL DEFAULT false,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_reconciliation_tenant_idx ON stripe_reconciliation_reports(tenant_id);

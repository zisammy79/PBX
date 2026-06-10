-- Application role (non-superuser) so RLS is enforced
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pbx_app') THEN
    CREATE ROLE pbx_app LOGIN PASSWORD 'pbx_app_password';
  END IF;
END
$$;--> statement-breakpoint
GRANT CONNECT ON DATABASE pbx TO pbx_app;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO pbx_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pbx_app;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pbx_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pbx_app;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO pbx_app;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_must_change" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE OR REPLACE FUNCTION pbx_tenant_allowed(row_tenant_id uuid)
RETURNS boolean AS $$
  SELECT
    NULLIF(current_setting('app.bypass_rls', true), '') = 'true'
    OR (
      NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
      AND row_tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    );
$$ LANGUAGE sql STABLE;--> statement-breakpoint
ALTER TABLE "extensions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "extensions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "extensions_tenant_all" ON "extensions"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint
ALTER TABLE "sip_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sip_credentials" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sip_credentials_tenant_all" ON "sip_credentials"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint
ALTER TABLE "calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "calls" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "calls_tenant_all" ON "calls"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint
ALTER TABLE "call_legs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "call_legs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "call_legs_tenant_all" ON "call_legs"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint
ALTER TABLE "call_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "call_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "call_events_tenant_all" ON "call_events"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint
ALTER TABLE "call_recordings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "call_recordings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "call_recordings_tenant_all" ON "call_recordings"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint
ALTER TABLE "usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "usage_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "usage_events_tenant_all" ON "usage_events"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint
ALTER TABLE "sip_trunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sip_trunks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sip_trunks_tenant_all" ON "sip_trunks"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint
ALTER TABLE "ai_agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_agents" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_agents_tenant_all" ON "ai_agents"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint
ALTER TABLE "tenant_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_memberships_tenant_all" ON "tenant_memberships"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "api_keys_tenant_all" ON "api_keys"
  FOR ALL USING (pbx_tenant_allowed(tenant_id))
  WITH CHECK (pbx_tenant_allowed(tenant_id));

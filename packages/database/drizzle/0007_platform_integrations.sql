-- Platform integration credential management
CREATE TABLE IF NOT EXISTS integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_type varchar(64) NOT NULL,
  provider varchar(64) NOT NULL,
  scope_type varchar(16) NOT NULL,
  scope_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  environment varchar(16) NOT NULL DEFAULT 'default',
  display_name varchar(255) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}',
  encrypted_payload text,
  encryption_key_version varchar(16) NOT NULL DEFAULT 'v1',
  credential_version integer NOT NULL DEFAULT 1,
  validation_status varchar(32) NOT NULL DEFAULT 'NOT_CONFIGURED',
  last_validated_at timestamptz,
  sanitized_validation_error text,
  rotated_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_connections_type_idx ON integration_connections(integration_type, provider);
CREATE INDEX IF NOT EXISTS integration_connections_scope_idx ON integration_connections(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS integration_connections_enabled_idx ON integration_connections(enabled);

CREATE TABLE IF NOT EXISTS integration_credential_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  version integer NOT NULL,
  encrypted_payload text NOT NULL,
  encryption_key_version varchar(16) NOT NULL DEFAULT 'v1',
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_credential_versions_uidx ON integration_credential_versions(connection_id, version);
CREATE INDEX IF NOT EXISTS integration_credential_versions_conn_idx ON integration_credential_versions(connection_id);

CREATE TABLE IF NOT EXISTS integration_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_assignments_uidx ON integration_assignments(connection_id, tenant_id);
CREATE INDEX IF NOT EXISTS integration_assignments_tenant_idx ON integration_assignments(tenant_id);

CREATE TABLE IF NOT EXISTS integration_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES integration_connections(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  action varchar(128) NOT NULL,
  actor_user_id uuid REFERENCES users(id),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_audit_connection_idx ON integration_audit_events(connection_id);
CREATE INDEX IF NOT EXISTS integration_audit_tenant_idx ON integration_audit_events(tenant_id);
CREATE INDEX IF NOT EXISTS integration_audit_created_idx ON integration_audit_events(created_at);

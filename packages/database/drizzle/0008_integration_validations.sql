-- Integration validation history (configuration and network probes)
CREATE TABLE IF NOT EXISTS integration_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  validation_level varchar(32) NOT NULL,
  status varchar(64) NOT NULL,
  sanitized_result jsonb NOT NULL DEFAULT '{}',
  round_trip_ms integer,
  credential_version integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS integration_validations_conn_idx ON integration_validations(connection_id);
CREATE INDEX IF NOT EXISTS integration_validations_created_idx ON integration_validations(created_at);

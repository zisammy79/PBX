CREATE TABLE IF NOT EXISTS platform_api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  token_prefix varchar(16) NOT NULL,
  token_hash text NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'active',
  role varchar(64) NOT NULL DEFAULT 'platform_super_admin',
  scopes jsonb NOT NULL DEFAULT '["*"]'::jsonb,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  rotated_from_token_id uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_api_tokens_prefix_active_uidx
  ON platform_api_tokens (token_prefix);

CREATE INDEX IF NOT EXISTS platform_api_tokens_prefix_idx
  ON platform_api_tokens (token_prefix);

CREATE INDEX IF NOT EXISTS platform_api_tokens_status_idx
  ON platform_api_tokens (status);

ALTER TABLE phone_numbers
  ADD COLUMN IF NOT EXISTS provider varchar(32) NOT NULL DEFAULT 'twilio',
  ADD COLUMN IF NOT EXISTS provider_sid varchar(34),
  ADD COLUMN IF NOT EXISTS status varchar(64) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS regulatory_status varchar(128),
  ADD COLUMN IF NOT EXISTS outbound_caller_id_policy jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS phone_numbers_provider_sid_idx ON phone_numbers (provider_sid);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'recording_status' AND e.enumlabel = 'starting'
  ) THEN
    ALTER TYPE recording_status ADD VALUE 'starting';
  END IF;
END $$;

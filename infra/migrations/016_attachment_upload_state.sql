-- Track attachment upload verification before messages may reference blobs.

BEGIN;

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS upload_state TEXT,
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS upload_failure_reason TEXT;

UPDATE attachments
SET upload_state = 'verified',
    uploaded_at = COALESCE(uploaded_at, created_at),
    verified_at = COALESCE(verified_at, created_at)
WHERE upload_state IS NULL;

ALTER TABLE attachments
  ALTER COLUMN upload_state SET DEFAULT 'initialized',
  ALTER COLUMN upload_state SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'attachments_upload_state_check'
  ) THEN
    ALTER TABLE attachments
      ADD CONSTRAINT attachments_upload_state_check
      CHECK (upload_state IN ('initialized', 'uploaded', 'verified', 'failed', 'expired'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS attachments_upload_state_idx
  ON attachments (upload_state, created_at);

COMMIT;

-- Add an explicit expiry boundary to native background poll tokens.
-- Existing tokens receive a bounded lifetime from their original creation time.

ALTER TABLE background_poll_tokens
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

UPDATE background_poll_tokens
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'background_poll_tokens'
      AND column_name = 'expires_at'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE background_poll_tokens ALTER COLUMN expires_at SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS background_poll_tokens_expires_at_idx
  ON background_poll_tokens (expires_at);

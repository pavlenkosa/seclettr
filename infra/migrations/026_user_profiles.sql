-- User profile fields: display name, bio, avatar
-- Avatar is stored in S3 under the profile-avatars/ prefix.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS bio          TEXT,
  ADD COLUMN IF NOT EXISTS avatar_key   TEXT;

-- Enforce lengths at the DB level (same limits as protocol validation).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    INNER JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'users' AND c.conname = 'users_display_name_length'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_display_name_length CHECK (char_length(display_name) <= 64);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    INNER JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'users' AND c.conname = 'users_bio_length'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_bio_length CHECK (char_length(bio) <= 200);
  END IF;
END $$;

COMMIT;

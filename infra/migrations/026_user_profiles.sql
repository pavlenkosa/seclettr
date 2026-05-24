-- User profile fields: display name, bio, avatar
-- Avatar is stored in S3 under the profile-avatars/ prefix.

BEGIN;

ALTER TABLE users
  ADD COLUMN display_name TEXT,
  ADD COLUMN bio          TEXT,
  ADD COLUMN avatar_key   TEXT;

-- Enforce lengths at the DB level (same limits as protocol validation).
ALTER TABLE users
  ADD CONSTRAINT users_display_name_length CHECK (char_length(display_name) <= 64),
  ADD CONSTRAINT users_bio_length          CHECK (char_length(bio)          <= 200);

COMMIT;

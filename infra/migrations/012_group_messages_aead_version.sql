-- Add AEAD version column to group_messages.
-- Existing rows pre-date the associated-data change and must be decrypted with
-- empty AD (aeadVersion = 0).  All newly inserted rows will carry the explicit
-- version from the sender, defaulting to 1 when the column is set at INSERT time.
ALTER TABLE group_messages
  ADD COLUMN IF NOT EXISTS aead_version SMALLINT NOT NULL DEFAULT 0;

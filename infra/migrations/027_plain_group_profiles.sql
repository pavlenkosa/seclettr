-- Migration 027: avatar and description for plain groups
-- Adds a profile layer to plain_groups: an optional avatar stored in S3 and
-- an optional freeform description (max 500 chars).

ALTER TABLE plain_groups
  ADD COLUMN IF NOT EXISTS avatar_key  TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT
    CHECK (description IS NULL OR char_length(description) <= 500);

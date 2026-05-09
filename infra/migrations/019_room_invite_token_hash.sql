BEGIN;

-- Replace plaintext invite token with SHA-256 hex digest.
-- The raw token is only returned to the creator at room creation time;
-- subsequent lookups hash the incoming token and compare against the stored digest.
ALTER TABLE room_invites RENAME COLUMN token TO token_hash;

-- Existing rows used plaintext nanoid tokens; they are all expired or invalid after this
-- migration because the lookup will now hash the input before comparing. Drop and recreate
-- the unique index so the name matches the new column.
ALTER TABLE room_invites DROP CONSTRAINT IF EXISTS room_invites_token_key;
DROP INDEX IF EXISTS room_invites_token_key;
CREATE UNIQUE INDEX room_invites_token_hash_key ON room_invites (token_hash);

COMMIT;

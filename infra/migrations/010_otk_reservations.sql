BEGIN;

ALTER TABLE one_time_prekeys
  ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reservation_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS reserved_for_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reserved_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS otk_key_id INTEGER,
  ADD COLUMN IF NOT EXISTS otk_reservation_token_hash TEXT;

CREATE INDEX IF NOT EXISTS otk_device_id_available
  ON one_time_prekeys (device_id, created_at DESC)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS otk_reserved_message_id
  ON one_time_prekeys (reserved_message_id)
  WHERE reserved_message_id IS NOT NULL;

COMMIT;

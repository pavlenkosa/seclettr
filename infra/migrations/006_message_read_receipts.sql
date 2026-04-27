BEGIN;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS messages_sender_unread_idx
  ON messages (sender_device_id, created_at)
  WHERE read_at IS NULL;

COMMIT;

-- Fix message idempotency constraint.
-- Previously client_message_id had a global UNIQUE constraint, which caused
-- only the first device to get a message stored when sending to multiple devices.
-- Subsequent inserts for other devices triggered ON CONFLICT and corrupted the
-- first row with a different device's ciphertext.
--
-- Correct constraint: unique per (client_message_id, recipient_device_id) pair,
-- since one logical "send" produces one ciphertext per recipient device.

BEGIN;

-- Drop the broken global unique constraint
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_client_message_id_key;

-- Add the correct composite unique constraint
ALTER TABLE messages
  ADD CONSTRAINT messages_client_message_id_device_unique
  UNIQUE (client_message_id, recipient_device_id);

COMMIT;

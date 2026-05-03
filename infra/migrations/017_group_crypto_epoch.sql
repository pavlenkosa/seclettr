-- Track a server-visible group crypto epoch.
-- Epoch changes when active membership changes and every group message records
-- the epoch it was encrypted for.

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS crypto_epoch INTEGER NOT NULL DEFAULT 1;

ALTER TABLE group_messages
  ADD COLUMN IF NOT EXISTS crypto_epoch INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS gm_group_epoch_created
  ON group_messages (group_id, crypto_epoch, created_at);

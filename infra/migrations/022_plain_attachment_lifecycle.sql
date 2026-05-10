-- Add soft-delete column to plain_attachments so orphaned uploads (no
-- referencing message, or only soft-deleted references) can be purged
-- by the retention scheduler.
--
-- Mirrors the lifecycle pattern used by the encrypted `attachments` table.

BEGIN;

ALTER TABLE plain_attachments
  ADD COLUMN deleted_at TIMESTAMPTZ;

-- Lookup index for the lifecycle purge batch.
CREATE INDEX pa_deleted_at
  ON plain_attachments (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Reverse-lookup from attachment to messages — used both by the download
-- authorization check (GET /plain/attachments/:id) and by the retention
-- sweep (`WHERE NOT EXISTS (SELECT FROM plain_messages WHERE attachment_id = ...)`).
-- Without this index both queries fall back to a sequential scan as the
-- table grows.
CREATE INDEX pm_attachment
  ON plain_messages (attachment_id)
  WHERE attachment_id IS NOT NULL;

COMMIT;

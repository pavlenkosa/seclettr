-- Track which device IDs are authorized to retrieve encrypted attachments.
-- This preserves zero-knowledge storage while enforcing access checks on fetch routes.

BEGIN;

CREATE TABLE IF NOT EXISTS attachment_access (
  attachment_id        UUID NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  device_id            UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  granted_by_device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (attachment_id, device_id)
);

CREATE INDEX IF NOT EXISTS attachment_access_device_idx
  ON attachment_access (device_id, created_at DESC);

COMMIT;

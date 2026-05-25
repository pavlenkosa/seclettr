BEGIN;

-- ─── Plain Groups ─────────────────────────────────────────────────────────────

CREATE TABLE plain_groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE plain_group_members (
  group_id   UUID NOT NULL REFERENCES plain_groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member'
               CHECK (role IN ('owner', 'admin', 'member')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX pgm_user ON plain_group_members (user_id) WHERE removed_at IS NULL;
CREATE INDEX pgm_group ON plain_group_members (group_id) WHERE removed_at IS NULL;

-- ─── Plain Attachments ────────────────────────────────────────────────────────

CREATE TABLE plain_attachments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  storage_key        TEXT NOT NULL UNIQUE,
  encrypted_size     BIGINT NOT NULL,
  content_type       TEXT NOT NULL,
  file_name          TEXT,
  upload_state       TEXT NOT NULL DEFAULT 'initialized'
                       CHECK (upload_state IN ('initialized', 'uploaded', 'verified', 'failed', 'expired')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Plain Messages ───────────────────────────────────────────────────────────

CREATE TABLE plain_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL UNIQUE,
  sender_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  -- For DM: recipient_user_id set, group_id NULL
  -- For group: group_id set, recipient_user_id NULL
  recipient_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  group_id          UUID REFERENCES plain_groups(id) ON DELETE CASCADE,
  content           TEXT NOT NULL DEFAULT '',
  message_type      TEXT NOT NULL CHECK (message_type IN ('text', 'attachment', 'voice_note', 'video_note')),
  attachment_id     UUID REFERENCES plain_attachments(id) ON DELETE SET NULL,
  reply_to_id       UUID REFERENCES plain_messages(id) ON DELETE SET NULL,
  duration_ms       INTEGER,
  media_group_id    UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at         TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT pm_target_check CHECK (
    (recipient_user_id IS NOT NULL AND group_id IS NULL) OR
    (recipient_user_id IS NULL AND group_id IS NOT NULL)
  )
);

-- Fetch conversation between two users ordered by time
CREATE INDEX pm_dm_thread ON plain_messages (
  LEAST(sender_user_id, recipient_user_id),
  GREATEST(sender_user_id, recipient_user_id),
  created_at
) WHERE recipient_user_id IS NOT NULL AND deleted_at IS NULL;

-- Fetch group thread
CREATE INDEX pm_group_thread ON plain_messages (group_id, created_at)
  WHERE group_id IS NOT NULL AND deleted_at IS NULL;

-- Sender lookup (for delete/edit authorization)
CREATE INDEX pm_sender ON plain_messages (sender_user_id, created_at);

-- ─── Read Receipts ────────────────────────────────────────────────────────────

CREATE TABLE plain_message_reads (
  message_id UUID NOT NULL REFERENCES plain_messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX pmr_user ON plain_message_reads (user_id, read_at);

-- ─── Updated-at trigger for plain_groups ─────────────────────────────────────

CREATE TRIGGER plain_groups_updated_at
  BEFORE UPDATE ON plain_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;

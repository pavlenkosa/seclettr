-- Per-user named folders for plain chats.
-- A chat belongs to at most one folder (no folder = visible in "All Chats" tab).
-- Folders are ordered by display_order (ascending = left-to-right in tab strip).

BEGIN;

CREATE TABLE plain_chat_folders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 50),
  display_order INT  NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sidebar query: list a user's folders in tab order.
CREATE INDEX pcf_user_order ON plain_chat_folders (user_id, display_order, created_at);

-- Junction table: one chat → at most one folder (enforced at app level via UPSERT).
-- peer_kind = 'dm' | 'group', peer_id = userId or plain_groups.id.
CREATE TABLE plain_chat_folder_entries (
  folder_id  UUID NOT NULL REFERENCES plain_chat_folders(id) ON DELETE CASCADE,
  peer_kind  TEXT NOT NULL CHECK (peer_kind IN ('dm', 'group')),
  peer_id    UUID NOT NULL,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (folder_id, peer_kind, peer_id)
);

-- Fast "which folder is this chat in?" lookup.
CREATE INDEX pcfe_peer ON plain_chat_folder_entries (peer_kind, peer_id);

COMMIT;

-- Per-user pinned plain chats (DM peers and groups). Pin is local to the
-- user — pinning a chat affects only the pinning user's sidebar order.

BEGIN;

CREATE TABLE plain_chat_pins (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  peer_kind  TEXT NOT NULL CHECK (peer_kind IN ('dm', 'group')),
  -- For 'dm' the peer's user_id; for 'group' the plain_groups.id. Stored as
  -- TEXT (not UUID FK) because the referenced table differs by peer_kind.
  -- Application-level cleanup happens via ON DELETE CASCADE on users / groups.
  peer_id    UUID NOT NULL,
  pinned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, peer_kind, peer_id)
);

-- Sidebar query: list a user's pins ordered by recency.
CREATE INDEX pcp_user_pinned_at
  ON plain_chat_pins (user_id, pinned_at DESC);

COMMIT;

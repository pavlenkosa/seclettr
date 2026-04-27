-- Explicit direct-relationship records used to scope metadata and prekey access.

BEGIN;

CREATE TABLE IF NOT EXISTS direct_relationships (
  user_low     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  initiated_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_low, user_high),
  CONSTRAINT direct_relationships_distinct_users CHECK (user_low <> user_high),
  CONSTRAINT direct_relationships_pair_order CHECK (user_low < user_high)
);

CREATE INDEX IF NOT EXISTS direct_relationships_initiated_by
  ON direct_relationships (initiated_by, created_at DESC);

COMMIT;

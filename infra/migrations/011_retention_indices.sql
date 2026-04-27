-- Indices to accelerate periodic retention-cleanup queries.

-- Direct messages: find delivered messages by age
CREATE INDEX IF NOT EXISTS messages_delivered_created_at
  ON messages (created_at)
  WHERE delivered_at IS NOT NULL;

-- Direct messages: find undelivered messages by age
CREATE INDEX IF NOT EXISTS messages_undelivered_created_at
  ON messages (created_at)
  WHERE delivered_at IS NULL;

-- Group messages: already indexed via gm_group (group_id, created_at) — no new index needed.

-- Used OTKs: find consumed keys by usage time for GC
CREATE INDEX IF NOT EXISTS otk_used_at
  ON one_time_prekeys (used_at)
  WHERE used_at IS NOT NULL;

-- Auth sessions: find expired sessions for GC
CREATE INDEX IF NOT EXISTS auth_sessions_expires_at
  ON auth_sessions (expires_at);

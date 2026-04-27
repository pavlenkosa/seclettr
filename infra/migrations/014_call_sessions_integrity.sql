BEGIN;

-- Index on call_sessions.group_id for group call lookups (WHERE group_id = $1 AND status IN (...)).
CREATE INDEX IF NOT EXISTS cs_group
  ON call_sessions (group_id, started_at)
  WHERE group_id IS NOT NULL;

-- Index on call_sessions.ended_at for retention cleanup (WHERE status = 'ended' AND ended_at < ...).
CREATE INDEX IF NOT EXISTS cs_ended_at
  ON call_sessions (ended_at)
  WHERE status = 'ended';

-- Enforce that exactly one of callee_user_id (direct call) or group_id (group call) is set.
DO $$ BEGIN
  ALTER TABLE call_sessions
    ADD CONSTRAINT cs_call_target_xor
    CHECK (
      (callee_user_id IS NOT NULL AND group_id IS NULL)
      OR
      (callee_user_id IS NULL AND group_id IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;

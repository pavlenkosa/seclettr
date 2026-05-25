BEGIN;

ALTER TABLE call_sessions ADD COLUMN IF NOT EXISTS is_room BOOLEAN NOT NULL DEFAULT FALSE;

-- Relax the XOR constraint to also allow standalone rooms (both callee_user_id and group_id NULL).
ALTER TABLE call_sessions DROP CONSTRAINT IF EXISTS cs_call_target_xor;
ALTER TABLE call_sessions
  ADD CONSTRAINT cs_call_target_xor CHECK (
    (callee_user_id IS NOT NULL AND group_id IS NULL AND is_room = FALSE)
    OR (callee_user_id IS NULL AND group_id IS NOT NULL AND is_room = FALSE)
    OR (callee_user_id IS NULL AND group_id IS NULL AND is_room = TRUE)
  );

CREATE TABLE room_invites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id UUID NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,
  token           TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ri_call_session ON room_invites (call_session_id);
CREATE INDEX ri_expires_at ON room_invites (expires_at);

CREATE TABLE room_guest_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_session_id UUID NOT NULL REFERENCES call_sessions(id) ON DELETE CASCADE,
  guest_name      TEXT NOT NULL CHECK (length(guest_name) BETWEEN 1 AND 64),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rgs_call_session ON room_guest_sessions (call_session_id);

COMMIT;

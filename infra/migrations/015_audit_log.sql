BEGIN;

CREATE TABLE IF NOT EXISTS audit_log (
  id           bigserial    PRIMARY KEY,
  event_type   text         NOT NULL,
  actor_user_id uuid        REFERENCES users(id) ON DELETE SET NULL,
  actor_device_id uuid,
  target_id    text,
  ip_address   inet,
  metadata     jsonb,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS al_actor
  ON audit_log (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS al_created_at
  ON audit_log (created_at DESC);

COMMIT;

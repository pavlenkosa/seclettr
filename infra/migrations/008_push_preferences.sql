-- Per-user web push delivery preferences.

BEGIN;

CREATE TABLE IF NOT EXISTS push_preferences (
  user_id                  UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  direct_messages_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  group_messages_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  call_invites_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  show_sender              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;

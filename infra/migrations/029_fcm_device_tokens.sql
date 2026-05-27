-- Store FCM device tokens for native push delivery (Android).
-- When configured, replaces the custom WebSocket foreground service
-- with Google Play Services push delivery via Firebase Cloud Messaging.

CREATE TABLE IF NOT EXISTS push_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  fcm_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_device_tokens_token
  ON push_device_tokens (fcm_token)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_push_device_tokens_user
  ON push_device_tokens (user_id)
  WHERE revoked_at IS NULL;

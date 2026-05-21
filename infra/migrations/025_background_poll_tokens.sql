-- Background poll tokens for Capacitor background runner.
-- One token per (user, device) pair — upserted on each login.
-- Token is stored as SHA-256 hex; fast lookup without argon2 overhead
-- (random 64-char nanoid token has sufficient entropy for raw hashing).
CREATE TABLE background_poll_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id  UUID        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT background_poll_tokens_user_device_unique UNIQUE (user_id, device_id)
);

CREATE INDEX background_poll_tokens_hash_idx ON background_poll_tokens (token_hash);

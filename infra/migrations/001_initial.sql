-- Seclettr initial schema
-- Run with: psql $DATABASE_URL -f this file

BEGIN;

-- ─── Extensions ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";    -- username search

-- ─── Users ────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username     TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,           -- Argon2id hash, never plaintext
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX users_username_trgm ON users USING gin (username gin_trgm_ops);

-- ─── Devices ──────────────────────────────────────────────────────────────────

CREATE TABLE devices (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  -- X25519 DH public key (base64url, 43–44 chars)
  identity_key_public  TEXT NOT NULL,
  -- Ed25519 signing public key (base64url)
  signing_key_public   TEXT NOT NULL,
  -- Signal registration ID (14-bit random integer)
  registration_id      INTEGER NOT NULL CHECK (registration_id BETWEEN 1 AND 16383),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at         TIMESTAMPTZ,
  CONSTRAINT devices_user_regid_unique UNIQUE (user_id, registration_id)
);

CREATE INDEX devices_user_id ON devices (user_id);

-- ─── Signed Prekeys ───────────────────────────────────────────────────────────

CREATE TABLE signed_prekeys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  key_id      INTEGER NOT NULL,
  public_key  TEXT NOT NULL,
  signature   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT spk_device_kid_unique UNIQUE (device_id, key_id)
);

CREATE INDEX spk_device_id ON signed_prekeys (device_id);

-- ─── One-Time Prekeys ─────────────────────────────────────────────────────────

CREATE TABLE one_time_prekeys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  key_id      INTEGER NOT NULL,
  public_key  TEXT NOT NULL,
  used_at     TIMESTAMPTZ,              -- set when consumed in X3DH
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT otk_device_kid_unique UNIQUE (device_id, key_id)
);

CREATE INDEX otk_device_id_unused ON one_time_prekeys (device_id) WHERE used_at IS NULL;

-- ─── Auth Sessions (refresh tokens) ──────────────────────────────────────────

CREATE TABLE auth_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id          UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  -- Argon2id hash of the opaque refresh token
  refresh_token_hash TEXT NOT NULL UNIQUE,
  expires_at         TIMESTAMPTZ NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX auth_sessions_user ON auth_sessions (user_id);
CREATE INDEX auth_sessions_expires ON auth_sessions (expires_at);

-- ─── Messages (encrypted envelopes — server never sees plaintext) ─────────────

CREATE TABLE messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_message_id   UUID NOT NULL UNIQUE,          -- idempotency key
  sender_device_id    UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  recipient_device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  -- Type: 'text' | 'attachment' | 'sender_key_distribution' | 'call_signal'
  message_type        TEXT NOT NULL,
  -- Base64url-encoded ciphertext (Double Ratchet header + AES-GCM payload)
  ciphertext          TEXT NOT NULL,
  -- X3DH header (only for session-initiating messages)
  x3dh_header         JSONB,
  -- Delivery state
  delivered_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_recipient ON messages (recipient_device_id, created_at)
  WHERE delivered_at IS NULL;
CREATE INDEX messages_sender ON messages (sender_device_id, created_at);

-- ─── Groups ───────────────────────────────────────────────────────────────────

CREATE TABLE groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  crypto_epoch INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX gm_user ON group_members (user_id) WHERE removed_at IS NULL;

-- ─── Group Messages (Sender Key encrypted) ───────────────────────────────────

CREATE TABLE group_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_device_id  UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  distribution_id   UUID NOT NULL,
  chain_id          INTEGER NOT NULL,
  message_id        INTEGER NOT NULL,
  message_type      TEXT NOT NULL,
  ciphertext        TEXT NOT NULL,
  signature         TEXT NOT NULL,
  crypto_epoch      INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gm_dist_chain_msg UNIQUE (distribution_id, chain_id, message_id)
);

CREATE INDEX gm_group ON group_messages (group_id, created_at);
CREATE INDEX gm_group_epoch_created ON group_messages (group_id, crypto_epoch, created_at);

-- ─── Attachments (encrypted blobs) ───────────────────────────────────────────

CREATE TABLE attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  -- S3/MinIO object key
  storage_key       TEXT NOT NULL UNIQUE,
  -- Encrypted size in bytes
  encrypted_size    BIGINT NOT NULL,
  -- SHA-256 digest of encrypted blob (base64url) for integrity check
  encrypted_digest  TEXT NOT NULL,
  -- MIME type of the original plaintext (stored to allow frontend rendering hints)
  content_type      TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Soft-delete: set when no message references this attachment
  deleted_at        TIMESTAMPTZ
);

-- ─── Call sessions ────────────────────────────────────────────────────────────

CREATE TABLE call_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caller_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  callee_user_id   UUID REFERENCES users(id) ON DELETE CASCADE,   -- NULL for group calls
  group_id      UUID REFERENCES groups(id) ON DELETE CASCADE,
  call_type     TEXT NOT NULL CHECK (call_type IN ('audio', 'video')),
  status        TEXT NOT NULL DEFAULT 'ringing'
                  CHECK (status IN ('ringing', 'active', 'ended', 'missed', 'rejected')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at   TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ
);

CREATE INDEX cs_caller ON call_sessions (caller_user_id, started_at);
CREATE INDEX cs_callee ON call_sessions (callee_user_id, started_at);

-- ─── Housekeeping trigger: update users.updated_at ───────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMIT;

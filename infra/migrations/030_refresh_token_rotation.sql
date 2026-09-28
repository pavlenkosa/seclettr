-- Migration 030: refresh-token rotation concurrency safety
-- Keeps the immediately superseded refresh-token hash so a request that raced
-- a rotation (e.g. double refresh / retry after a dropped response) can still
-- be answered within a short grace window with an access-token-only response
-- instead of being logged out. rotated_at bounds that grace window.

BEGIN;

ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS previous_refresh_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMIT;

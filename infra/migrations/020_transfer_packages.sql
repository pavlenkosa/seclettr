BEGIN;

CREATE TABLE transfer_packages (
  id          TEXT        PRIMARY KEY,
  payload     BYTEA       NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour'
);

CREATE INDEX transfer_packages_expires_at_idx ON transfer_packages (expires_at);

COMMIT;

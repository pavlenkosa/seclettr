/**
 * Refresh-token rotation core, extracted from the /auth/refresh route so the
 * lock-and-verify flow is unit-testable with a fake pg client.
 *
 * Concurrency safety: the session row is selected FOR UPDATE inside the
 * caller's transaction, so concurrent refreshes with the same token are
 * serialized. Exactly one request verifies against the current hash and
 * rotates; the loser verifies against the previous hash and — within a short
 * grace window — receives an access-token-only response instead of a 401.
 *
 * Token material is never logged and never stored: only argon2 hashes of the
 * secrets are persisted, which is why a grace-window reuse cannot be answered
 * with a new refresh token (the current token string cannot be reconstructed
 * from its hash).
 */
import argon2 from "argon2";
import { nanoid } from "nanoid";
import type { QueryResultRow } from "pg";
import { buildRefreshToken } from "../utils/refresh-token.js";

export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const satisfies argon2.Options & { raw?: false };

/** Minimal pg-PoolClient-like surface needed by the rotation flow. */
export interface RefreshRotationClient {
  query<T extends QueryResultRow>(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

export interface RefreshSessionLockRow {
  id: string;
  user_id: string;
  device_id: string;
  refresh_token_hash: string;
  previous_refresh_token_hash: string | null;
  rotated_at: Date | null;
  within_grace: boolean;
}

export type RefreshRotationResult =
  | {
      outcome: "rotated";
      sessionId: string;
      userId: string;
      deviceId: string;
      refreshToken: string;
    }
  | {
      /** Grace-window reuse of the immediately-previous token: no rotation, no new token. */
      outcome: "grace";
      sessionId: string;
      userId: string;
      deviceId: string;
    }
  | {
      outcome: "rejected";
      /**
       * True when the presented token matched the previous (already-rotated)
       * hash but fell outside the grace window — a confirmed reuse signal,
       * distinct from random garbage.
       */
      confirmedReuse: boolean;
      userId: string | null;
      deviceId: string | null;
    };

export interface RotateRefreshTokenParams {
  client: RefreshRotationClient;
  sessionId: string;
  secret: string;
  /** Grace window (seconds) for reuse of the immediately-previous token. */
  graceSeconds: number;
}

/**
 * Must be called inside a transaction: the SELECT ... FOR UPDATE serializes
 * concurrent refreshes of the same session. A new secret is generated (and
 * hashed) only on the rotation path, lazily while the row lock is held.
 */
export async function rotateRefreshTokenInLock(
  params: RotateRefreshTokenParams
): Promise<RefreshRotationResult> {
  const { client, sessionId, secret, graceSeconds } = params;

  const locked = await client.query<RefreshSessionLockRow>(
    `SELECT
       id,
       user_id,
       device_id,
       refresh_token_hash,
       previous_refresh_token_hash,
       rotated_at,
       (
         previous_refresh_token_hash IS NOT NULL
         AND (now() - rotated_at) <= make_interval(secs => $2::double precision)
       ) AS within_grace
     FROM auth_sessions
     WHERE id = $1 AND expires_at > now()
     LIMIT 1
     FOR UPDATE`,
    [sessionId, graceSeconds]
  );

  const session = locked.rows[0];
  if (!session) {
    // Session deleted (logout) or expired.
    return { outcome: "rejected", confirmedReuse: false, userId: null, deviceId: null };
  }

  const currentValid = await argon2
    .verify(session.refresh_token_hash, secret)
    .catch(() => false);

  if (currentValid) {
    // Rotation path (a): winner of the race. Generate the new secret lazily
    // inside the lock so losers of the race never consume entropy or hashes.
    const newSecret = nanoid(64);
    const newHash = await argon2.hash(newSecret, ARGON2_OPTIONS);
    await client.query(
      `UPDATE auth_sessions
       SET refresh_token_hash = $1,
           previous_refresh_token_hash = $2,
           rotated_at = now(),
           last_used_at = now()
       WHERE id = $3`,
      [newHash, session.refresh_token_hash, session.id]
    );
    return {
      outcome: "rotated",
      sessionId: session.id,
      userId: session.user_id,
      deviceId: session.device_id,
      refreshToken: buildRefreshToken(session.id, newSecret),
    };
  }

  if (session.previous_refresh_token_hash !== null) {
    const previousValid = await argon2
      .verify(session.previous_refresh_token_hash, secret)
      .catch(() => false);

    if (previousValid) {
      if (session.within_grace) {
        // Grace path (b): the caller raced a rotation (e.g. double refresh).
        // The current token string cannot be reconstructed from its argon2
        // hash, so only an access token can be issued — no rotation, no new
        // refresh token.
        return {
          outcome: "grace",
          sessionId: session.id,
          userId: session.user_id,
          deviceId: session.device_id,
        };
      }
      // Grace path (c): confirmed reuse beyond the grace window.
      return {
        outcome: "rejected",
        confirmedReuse: true,
        userId: session.user_id,
        deviceId: session.device_id,
      };
    }
  }

  return {
    outcome: "rejected",
    confirmedReuse: false,
    userId: session.user_id,
    deviceId: session.device_id,
  };
}

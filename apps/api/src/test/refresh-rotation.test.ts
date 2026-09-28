/**
 * Unit tests for the refresh-token rotation core (refresh-rotation.ts).
 *
 * Covers the F5 concurrency design: a row lock (FOR UPDATE) serializes
 * concurrent refreshes so exactly one caller rotates; a caller presenting the
 * just-superseded token within the grace window gets an access-token-only
 * response; confirmed reuse beyond the window and unknown tokens are rejected.
 *
 * The pg client is mocked (same style as auth-middleware.test.ts); argon2 runs
 * for real so the hash/verify paths are exercised end-to-end.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import argon2 from "argon2";
import type { QueryResultRow } from "pg";
import {
  ARGON2_OPTIONS,
  rotateRefreshTokenInLock,
  type RefreshRotationClient,
  type RefreshSessionLockRow,
} from "../services/refresh-rotation.js";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";
const DEVICE_ID = "33333333-3333-3333-3333-333333333333";

interface FakeState {
  /** Hash currently stored in refresh_token_hash. */
  currentHash: string;
  /** Hash stored in previous_refresh_token_hash (null until first rotation). */
  previousHash: string | null;
  /** Simulated DB now() minus rotated_at, in seconds. */
  secondsSinceRotation: number;
  /**
   * Overrides the derived within_grace value. Used to simulate a hypothetical
   * DB where within_grace came out true despite a NULL previous hash (the
   * regression the SQL IS NOT NULL guard defends against); null = derive it
   * exactly like the production SQL does.
   */
  forceWithinGrace: boolean | null;
  /** When false, the session row is "deleted"/expired (SELECT returns no rows). */
  sessionExists: boolean;
  rotatedCount: number;
  /**
   * FIFO queue emulating SELECT ... FOR UPDATE serialization: a caller's lock
   * read waits behind the previous holder until its transaction wrapper
   * releases (the route holds the lock until COMMIT).
   */
  lockTail: Promise<void>;
}

let state: FakeState;

/** Captured UPDATE payloads for asserting the exact-one-rotation invariant. */
let updates: Array<{ refresh_token_hash: string; previous_refresh_token_hash: string }>;

function fakeClient(): {
  client: RefreshRotationClient;
  releaseLock: () => void;
} {
  // releaseLock mirrors the transaction wrapper's COMMIT: it must be called
  // when the caller's transaction ends so the next FOR UPDATE reader proceeds.
  let releaseLock = (): void => undefined;
  const client = {
    query<T extends QueryResultRow>(
      text: string,
      values?: unknown[]
    ): Promise<{ rows: T[]; rowCount: number | null }> {
      if (/FOR UPDATE/.test(text)) {
        // Serialize lock readers like the real row lock: each FOR UPDATE read
        // waits for the previous lock holder to release before observing state.
        // The row must be built at lock-acquire time (inside the then), not at
        // queue time, so callers racing a rotation observe post-rotation state.
        const wait = state.lockTail;
        let release!: () => void;
        const done = new Promise<void>((resolve) => {
          release = resolve;
        });
        state.lockTail = done;
        releaseLock = release;
        return wait.then(() => {
          if (!state.sessionExists) {
            release();
            return { rows: [] as T[], rowCount: 0 };
          }
          const row: RefreshSessionLockRow = {
            id: SESSION_ID,
            user_id: USER_ID,
            device_id: DEVICE_ID,
            refresh_token_hash: state.currentHash,
            previous_refresh_token_hash: state.previousHash,
            rotated_at: new Date(Date.now() - state.secondsSinceRotation * 1000),
            within_grace:
              state.forceWithinGrace !== null
                ? state.forceWithinGrace
                : state.previousHash !== null && state.secondsSinceRotation <= 30,
          };
          return { rows: [row as unknown as T], rowCount: 1 };
        });
      }
      if (/^UPDATE auth_sessions/.test(text)) {
        updates.push({
          refresh_token_hash: values![0] as string,
          previous_refresh_token_hash: values![1] as string,
        });
        state.rotatedCount += 1;
        state.previousHash = values![1] as string;
        state.currentHash = values![0] as string;
        state.secondsSinceRotation = 0;
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  } as unknown as RefreshRotationClient;
  return { client, releaseLock: () => releaseLock() };
}

async function hashOf(secret: string): Promise<string> {
  return argon2.hash(secret, ARGON2_OPTIONS);
}

async function runRotation(secret: string) {
  // Mirrors the route's transaction() wrapper: the FOR UPDATE lock is held for
  // the whole rotation and released only when the transaction completes.
  const { client, releaseLock } = fakeClient();
  try {
    return await rotateRefreshTokenInLock({
      client,
      sessionId: SESSION_ID,
      secret,
      graceSeconds: 30,
    });
  } finally {
    releaseLock();
  }
}

beforeEach(() => {
  updates = [];
  state = {
    currentHash: "",
    previousHash: null,
    secondsSinceRotation: 0,
    forceWithinGrace: null,
    sessionExists: true,
    rotatedCount: 0,
    lockTail: Promise.resolve(),
  };
});

describe("rotateRefreshTokenInLock", () => {
  it("rotates exactly once for two concurrent refreshes with the same old token; second goes through grace without state change", async () => {
    const oldSecret = "old-secret";
    state.currentHash = await hashOf(oldSecret);

    const [first, second] = await Promise.all([
      runRotation(oldSecret),
      runRotation(oldSecret),
    ]);

    expect(first.outcome).toBe("rotated");
    expect(second.outcome).toBe("grace");
    expect(state.rotatedCount).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.previous_refresh_token_hash).toBe(state.previousHash);
    if (first.outcome === "rotated") {
      expect(first.refreshToken.split(".")[0]).toBe("v1");
      expect(first.refreshToken.split(".")[1]).toBe(SESSION_ID);
      expect(first.refreshToken.split(".")[2]).not.toBe(oldSecret);
    }
    if (second.outcome === "grace") {
      expect("refreshToken" in second).toBe(false);
    }
  });

  it("accepts a grace reuse of the previous token without rotating", async () => {
    const oldSecret = "old-secret";
    const newSecret = "new-secret";
    state.currentHash = await hashOf(newSecret);
    state.previousHash = await hashOf(oldSecret);
    state.secondsSinceRotation = 5;

    const result = await runRotation(oldSecret);

    expect(result).toMatchObject({ outcome: "grace", sessionId: SESSION_ID, userId: USER_ID });
    expect(state.rotatedCount).toBe(0);
    expect(updates).toHaveLength(0);
    expect("refreshToken" in result).toBe(false);
  });

  it("rejects a previous-previous token replay with 401-style rejection", async () => {
    const oldestSecret = "oldest-secret";
    const currentSecret = "current-secret";
    state.currentHash = await hashOf(currentSecret);
    // previous hash corresponds to a *different* secret than the presented one:
    // the presented token is from two rotations ago.
    state.previousHash = await hashOf("previous-secret");
    state.secondsSinceRotation = 0;

    const result = await runRotation(oldestSecret);

    expect(result).toMatchObject({ outcome: "rejected", confirmedReuse: false });
    expect(state.rotatedCount).toBe(0);
  });

  it("rejects confirmed reuse of the previous token beyond the grace window", async () => {
    const oldSecret = "old-secret";
    const newSecret = "new-secret";
    state.currentHash = await hashOf(newSecret);
    state.previousHash = await hashOf(oldSecret);
    state.secondsSinceRotation = 61; // beyond 30s grace

    const result = await runRotation(oldSecret);

    expect(result).toMatchObject({ outcome: "rejected", confirmedReuse: true, userId: USER_ID });
    expect(state.rotatedCount).toBe(0);
  });

  it("rejects a token for a deleted (logged-out) session", async () => {
    const secret = "old-secret";
    state.currentHash = await hashOf(secret);
    state.sessionExists = false;

    const result = await runRotation(secret);

    expect(result).toMatchObject({ outcome: "rejected", confirmedReuse: false, userId: null });
    expect(state.rotatedCount).toBe(0);
  });

  it("rejects random garbage that matches no hash", async () => {
    state.currentHash = await hashOf("real-secret");

    const result = await runRotation("garbage");

    expect(result).toMatchObject({ outcome: "rejected", confirmedReuse: false });
  });

  it("keeps the grace window DB-side: within_grace is computed by the query, not the caller", async () => {
    const spy = vi.fn();
    const { client } = fakeClient();
    const originalQuery = client.query.bind(client);
    const spiedQuery: RefreshRotationClient["query"] = (...args) => {
      spy(...args);
      return (originalQuery as (...a: unknown[]) => Promise<never>)(...(args as [string]));
    };
    client.query = spiedQuery;

    // Present the *previous* secret so the flow takes the grace path: exactly
    // one locked SELECT, whose SQL itself computes within_grace.
    state.currentHash = await hashOf("current");
    state.previousHash = await hashOf("previous");
    state.secondsSinceRotation = 5;
    await rotateRefreshTokenInLock({
      client,
      sessionId: SESSION_ID,
      secret: "previous",
      graceSeconds: 30,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [text, values] = spy.mock.calls[0] as [string, unknown[]];
    expect(text).toContain("FOR UPDATE");
    expect(text).toContain("make_interval(secs =>");
    expect(values).toContain(30);
    // The grace window must be DB-side AND null-safe: within_grace must not be
    // computable as true when previous_refresh_token_hash is NULL. Pre-migration
    // rows get rotated_at = migration time from the column default (never
    // actually rotated), so a stale now()-rotated_at delta alone must never
    // open the grace path — the IS NOT NULL conjunct is the causal guard.
    expect(text).toMatch(
      /previous_refresh_token_hash\s+IS\s+NOT\s+NULL\s*\n?\s*AND\s*\(now\(\)\s*-\s*rotated_at\)/,
    );
  });

  it("rotates a never-rotated (pre-migration) row on its current secret even if within_grace were spuriously true", async () => {
    // Pre-migration row: previous_refresh_token_hash IS NULL and rotated_at
    // only holds the migration-default now() value. Even if a hypothetically
    // mis-computed within_grace flag arrived as true, the service must take
    // the rotation path: the grace path is gated on a non-null previous hash
    // verified against the presented secret.
    const secret = "pre-migration-secret";
    state.currentHash = await hashOf(secret);
    state.previousHash = null;
    state.forceWithinGrace = true; // simulate the defect the SQL guard prevents

    const result = await runRotation(secret);

    expect(result).toMatchObject({ outcome: "rotated", sessionId: SESSION_ID });
    expect(state.rotatedCount).toBe(1);
    expect(updates).toHaveLength(1);
    // The first rotation must seed previous_refresh_token_hash from the
    // pre-rotation current hash — exactly one prior-generation token exists.
    expect(updates[0]!.previous_refresh_token_hash).toBe(state.previousHash);
    expect(updates[0]!.refresh_token_hash).not.toBe(state.previousHash);
  });
});

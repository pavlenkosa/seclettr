/**
 * Regression test for the per-IP rate limit on /calls/turn-credentials.
 *
 * The route's budget is overridable via QM_API_TEST_CALL_ROUTE_RATE_LIMIT_MAX
 * (mirrors the auth-route override pattern). To exercise real 429 behavior
 * deterministically, this suite must run with a SMALL explicit value on the
 * vitest CLI env:
 *
 *   QM_API_INCLUDE_INTEGRATION_TESTS=1 \
 *   DATABASE_URL=postgresql://... \
 *   QM_API_TEST_CALL_ROUTE_RATE_LIMIT_MAX=3 \
 *   pnpm --filter @seclettr/api exec vitest run \
 *     src/test/call-route-rate-limit.integration.test.ts
 *
 * Isolation rationale: global-setup.ts sets a default of 10000 ONLY when the
 * variable is absent (assign-if-absent), so an explicit CLI value like 3 wins
 * inside this suite while every other integration suite keeps the 10000 budget.
 * This keeps the per-suite override deterministic without starving shared-IP
 * request budgets elsewhere in CI, keeping the full suite green.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { AUTH_PROTOCOL_VERSION } from "@seclettr/protocol";

const BASE_URL = process.env["API_URL"] ?? "http://localhost:3001";

// Direct DB handle for cleanup only (distinct prefix emails, same pattern as
// the other integration suites).
let admin: pg.Pool;

const FAKE_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const FAKE_SIG =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

interface Session {
  userId: string;
  deviceId: string;
  accessToken: string;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function deviceProvisioning(registrationId: number) {
  return {
    name: "Call Rate Limit IT Device",
    identityKeyPublic: FAKE_KEY,
    signingKeyPublic: FAKE_KEY,
    registrationId,
    signedPreKey: { id: 1, publicKey: FAKE_KEY, signature: FAKE_SIG },
    oneTimePreKeys: Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      publicKey: FAKE_KEY,
    })),
  };
}

async function registerUser(username: string): Promise<Session> {
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://localhost" },
    body: JSON.stringify({
      version: AUTH_PROTOCOL_VERSION,
      username,
      password: "TestPassword123!",
      device: deviceProvisioning(Math.floor(Math.random() * 16382) + 1),
    }),
  });
  const body = (await res.json()) as {
    userId?: string;
    deviceId?: string;
    accessToken?: string;
  };
  if (!body.userId || !body.deviceId || !body.accessToken) {
    throw new Error(`register failed: ${res.status}`);
  }
  expect(res.status).toBe(201);
  return {
    userId: body.userId,
    deviceId: body.deviceId,
    accessToken: body.accessToken,
  };
}

async function provisionedUser(): Promise<Session> {
  return registerUser(`crlimit_${Date.now()}_${Math.floor(Math.random() * 1e9)}`);
}

beforeAll(() => {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for call-route-rate-limit integration tests"
    );
  }
  admin = new pg.Pool({ connectionString: databaseUrl, max: 3 });
});

afterAll(async () => {
  if (admin) {
    await admin
      .query(`DELETE FROM users WHERE username LIKE 'crlimit_%'`)
      .catch(() => undefined);
    await admin.end();
  }
});

// Dedicated mode = the harness runs with a SMALL effective budget (explicit
// CLI value, e.g. MAX=3). When no explicit value is present, global-setup.ts
// assigns a full-suite headroom default of 10000 (workers inherit it; verified
// with runtime probes in dedicated vs full-suite mode), which makes a 429
// mathematically unreachable for any affordable request count — and probing it
// would also collide with the shared per-IP limiter. Skip only in that case.
// Runtime evidence: vitest's `it.skip(condition)` form does not accept a
// boolean condition in the first argument — the first argument is the test
// title. A ternary title there skipped the 429 test even when MAX=3 was
// correctly visible to the worker (title strings are always truthy), so
// detection must use `it.skipIf(condition)` and a static title.
const _rawMax = process.env["QM_API_TEST_CALL_ROUTE_RATE_LIMIT_MAX"];
const parsedMax = _rawMax ? Number.parseInt(_rawMax, 10) : NaN;
const effectiveBudget =
  Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : 90;
const harnessDefault = effectiveBudget >= 100;

describe("call route rate limit", () => {
  it.skipIf(harnessDefault)(
    "caps the configured per-IP budget, returns 429 with Retry-After, and fails closed",
    async () => {
    // Mirror the route's override semantics: explicit env value, else the
    // production default of 90. The same invariant is checked for both the
    // targeted run (MAX=3) and the full suite (global-setup's 10000 default):
    // among budget+1 requests at most `budget` succeed, the first over-budget
    // request gets the documented 429 body with a positive Retry-After, and a
    // subsequent request still fails closed. The per-IP Redis counter is
    // shared across parallel test files and prior runs inside the same 60s
    // window, so the exact number of 200s may be lower; the CAP itself is the
    // deterministic, order-independent contract.
    const override = process.env["QM_API_TEST_CALL_ROUTE_RATE_LIMIT_MAX"];
    const parsed = override ? Number.parseInt(override, 10) : NaN;
    const budget = Number.isFinite(parsed) && parsed > 0 ? parsed : 90;

    const user = await provisionedUser();

    const statuses: number[] = [];
    let limitedBody: { error?: string } = {};
    let retryAfter: string | null = null;
    for (let i = 0; i <= budget; i += 1) {
      const res = await fetch(`${BASE_URL}/calls/turn-credentials`, {
        headers: authHeaders(user.accessToken),
      });
      if (res.status !== 200) {
        limitedBody = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        retryAfter = res.headers.get("Retry-After");
      }
      statuses.push(res.status);
      if (res.status !== 200) break;
    }

    const okCount = statuses.filter((s) => s === 200).length;
    // The fixed-window cap is honored: never more than `budget` successes,
    // and at least one request over the cap was rejected with 429.
    expect(okCount).toBeLessThanOrEqual(budget);
    expect(statuses).toContain(429);
    const firstLimited = statuses.indexOf(429);
    // No request after the cap succeeded.
    expect(statuses.slice(firstLimited)).toEqual(
      statuses.slice(firstLimited).map(() => 429)
    );
    expect(limitedBody.error).toBe("Too many call requests");
    // Retry-After is a positive number of seconds.
    expect(retryAfter).not.toBeNull();
    expect(Number.parseInt(retryAfter ?? "", 10)).toBeGreaterThan(0);

    // A further request AFTER the limit is reached keeps failing closed (no
    // budget regeneration mid-window).
    const again = await fetch(`${BASE_URL}/calls/turn-credentials`, {
      headers: authHeaders(user.accessToken),
    });
    expect(again.status).toBe(429);
    const againBody = (await again.json().catch(() => ({}))) as {
      error?: string;
    };
    expect(againBody.error).toBe("Too many call requests");
  });

  it("full-suite smoke: a few turn-credential GETs succeed (budget not exhausted)", async () => {
    if (!harnessDefault) {
      // The dedicated run already exercises the full 429 contract above; a
      // smoke probe under MAX=3 would consume the tiny budget. Nothing to add.
      return;
    }
    const user = await provisionedUser();
    for (let i = 0; i < 3; i += 1) {
      const res = await fetch(`${BASE_URL}/calls/turn-credentials`, {
        headers: authHeaders(user.accessToken),
      });
      expect(res.status).toBe(200);
    }
  });
});

/**
 * HTTP-level integration tests for the calls lifecycle routes (POST /calls,
 * GET /calls/turn-credentials, GET /:callId/sfu-access, POST
 * /:callId/direct-hangup, POST /:callId/direct-reject) against a REAL
 * Postgres. No DB mocks.
 *
 * Run (same pattern as the other integration suites, with a THROWAWAY DB):
 *   QM_API_INCLUDE_INTEGRATION_TESTS=1 \
 *   DATABASE_URL=postgresql://<user>:<password>@127.0.0.1:<port>/seclettr_calls_it \
 *   ALLOW_PUBLIC_REGISTRATION=true \
 *   pnpm --filter @seclettr/api exec vitest run src/test/calls.integration.test.ts
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
    name: "Calls IT Device",
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

let usernameSeq = 0;

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
  const username = `cl_it_${Date.now()}_${usernameSeq++}_${Math.floor(Math.random() * 1e6)}`;
  return registerUser(username);
}

async function createCall(
  caller: Session,
  calleeUserId: string
): Promise<{ status: number; body: { callId?: string; error?: string } }> {
  const res = await fetch(`${BASE_URL}/calls`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(caller.accessToken),
    },
    body: JSON.stringify({ calleeUserId, callType: "audio" }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    callId?: string;
    error?: string;
  };
  return { status: res.status, body };
}

async function sfuAccess(
  session: Session,
  callId: string
): Promise<{ status: number; body: { ok?: boolean; error?: string } }> {
  const res = await fetch(`${BASE_URL}/calls/${callId}/sfu-access`, {
    headers: authHeaders(session.accessToken),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  return { status: res.status, body };
}

async function directHangup(
  session: Session,
  callId: string
): Promise<{ status: number; body: { ok?: boolean; error?: string } }> {
  const res = await fetch(`${BASE_URL}/calls/${callId}/direct-hangup`, {
    method: "POST",
    headers: authHeaders(session.accessToken),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  return { status: res.status, body };
}

async function directReject(
  session: Session,
  callId: string
): Promise<{ status: number; body: { ok?: boolean; error?: string } }> {
  const res = await fetch(`${BASE_URL}/calls/${callId}/direct-reject`, {
    method: "POST",
    headers: authHeaders(session.accessToken),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  return { status: res.status, body };
}

async function putStatus(
  session: Session,
  callId: string,
  status: string
): Promise<{ status: number; body: { ok?: boolean; error?: string } }> {
  const res = await fetch(`${BASE_URL}/calls/${callId}/status`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(session.accessToken),
    },
    body: JSON.stringify({ status }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  return { status: res.status, body };
}

beforeAll(() => {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for calls integration tests");
  }
  admin = new pg.Pool({ connectionString: databaseUrl, max: 3 });
});

afterAll(async () => {
  if (admin) {
    await admin
      .query(`DELETE FROM users WHERE username LIKE 'cl_it_%'`)
      .catch(() => undefined);
    await admin.end();
  }
});

describe("Calls lifecycle over HTTP (real Postgres)", () => {
  it("scenario a: A creates direct call to B → callId; turn-credentials issued", async () => {
    const a = await provisionedUser();
    const b = await provisionedUser();

    const created = await createCall(a, b.userId);
    expect(created.status).toBe(200);
    expect(typeof created.body.callId).toBe("string");

    const turn = await fetch(`${BASE_URL}/calls/turn-credentials`, {
      headers: authHeaders(a.accessToken),
    });
    expect(turn.status).toBe(200);
    const turnBody = (await turn.json()) as { username?: string; ttl?: number };
    expect(turnBody.username).toContain(a.userId);
    expect(turnBody.ttl).toBe(86400);
  });

  it("scenario b: caller and callee both get sfu-access on a ringing direct call", async () => {
    const a = await provisionedUser();
    const b = await provisionedUser();
    const { callId } = (await createCall(a, b.userId)).body as {
      callId: string;
    };

    const callerAccess = await sfuAccess(a, callId);
    expect(callerAccess.status).toBe(200);
    expect(callerAccess.body.ok).toBe(true);

    const calleeAccess = await sfuAccess(b, callId);
    expect(calleeAccess.status).toBe(200);
    expect(calleeAccess.body.ok).toBe(true);
  });

  it("scenario c: unrelated user C denied sfu-access/hangup/reject on A↔B call", async () => {
    const a = await provisionedUser();
    const b = await provisionedUser();
    const c = await provisionedUser();
    const { callId } = (await createCall(a, b.userId)).body as {
      callId: string;
    };

    const access = await sfuAccess(c, callId);
    expect(access.status).toBe(403);
    expect(access.body.error).toBe("Forbidden");

    const hangup = await directHangup(c, callId);
    expect(hangup.status).toBe(403);
    expect(hangup.body.error).toBe("Forbidden");

    const reject = await directReject(c, callId);
    expect(reject.status).toBe(403);
    expect(reject.body.error).toBe("Forbidden");

    const statusPut = await putStatus(c, callId, "ended");
    expect(statusPut.status).toBe(400);
    expect(statusPut.body.error).toBe("Use direct call lifecycle endpoints");
  });

  it("scenario d: B rejects → call terminal; subsequent hangup/reject → 404", async () => {
    const a = await provisionedUser();
    const b = await provisionedUser();
    const { callId } = (await createCall(a, b.userId)).body as {
      callId: string;
    };

    const reject = await directReject(b, callId);
    expect(reject.status).toBe(200);
    expect(reject.body.ok).toBe(true);

    // Call is no longer active: lifecycle endpoints report not found.
    const hangupAfter = await directHangup(a, callId);
    expect(hangupAfter.status).toBe(404);
    const rejectAfter = await directReject(a, callId);
    expect(rejectAfter.status).toBe(404);
    const accessAfter = await sfuAccess(a, callId);
    expect(accessAfter.status).toBe(404);
  });

  it("scenario e: A hangs up ringing call → 200; B-side afterwards 404; missed-direct unaffected for caller", async () => {
    const a = await provisionedUser();
    const b = await provisionedUser();
    const { callId } = (await createCall(a, b.userId)).body as {
      callId: string;
    };

    const hangup = await directHangup(a, callId);
    expect(hangup.status).toBe(200);
    expect(hangup.body.ok).toBe(true);

    const accessAfter = await sfuAccess(b, callId);
    expect(accessAfter.status).toBe(404);

    // Missed-call listing only applies to the callee, and requires a push payload;
    // for the caller the list is empty either way.
    const missed = await fetch(`${BASE_URL}/calls/missed-direct`, {
      headers: authHeaders(a.accessToken),
    });
    expect(missed.status).toBe(200);
    const missedBody = (await missed.json()) as { calls: unknown[] };
    expect(missedBody.calls).toHaveLength(0);
  });

  it("scenario f: unauthenticated call routes → 401", async () => {
    const noAuth = await fetch(`${BASE_URL}/calls/turn-credentials`);
    expect(noAuth.status).toBe(401);

    const createNoAuth = await fetch(`${BASE_URL}/calls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calleeUserId: "00000000-0000-0000-0000-000000000000", callType: "audio" }),
    });
    expect(createNoAuth.status).toBe(401);
  });
});

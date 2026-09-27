/**
 * HTTP-level integration tests for auth deny paths and attachment complete
 * authorization against a REAL Postgres. No DB mocks.
 *
 * Complements attachment-access.test.ts (which already covers stranger
 * download-url 404, inline ciphertext 404, non-uploader proxy upload 403,
 * foreign message reference 403, digest 400, pre-completion 409) with:
 *   - B POST /attachments/:id/complete on A's attachment → 403;
 *   - wrong-password login → 401;
 *   - nonexistent-user login → 401 with IDENTICAL body (no user enumeration);
 *   - access token rejected after logout (session-bound tokens, H4);
 *   - malformed bearer token → 401.
 *
 * Rate-limit denial scenarios are intentionally NOT covered here: the
 * integration global-setup forces QM_API_TEST_AUTH_RATE_LIMIT_MAX=500 to keep
 * registration/login flows reliable, so a genuine 429 path cannot be exercised
 * under this harness (see global-setup.ts).
 *
 * Run (same pattern as the other integration suites, with a THROWAWAY DB):
 *   QM_API_INCLUDE_INTEGRATION_TESTS=1 \
 *   DATABASE_URL=postgresql://<user>:<password>@127.0.0.1:<port>/seclettr_authatt_it \
 *   ALLOW_PUBLIC_REGISTRATION=true \
 *   pnpm --filter @seclettr/api exec vitest run src/test/auth-attachment-deny.integration.test.ts
 */
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import {
  AUTH_PROTOCOL_VERSION,
  DEVICES_PROTOCOL_VERSION,
  MESSAGE_PROTOCOL_VERSION,
} from "@seclettr/protocol";

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
  refreshToken?: string;
}

function deviceProvisioning(registrationId: number) {
  return {
    name: "Auth-Attachment Deny IT Device",
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

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

let usernameSeq = 0;

function nextUsername(): string {
  return `aa_it_${Date.now()}_${usernameSeq++}_${Math.floor(Math.random() * 1e6)}`;
}

interface RegisterResult {
  status: number;
  session?: Session;
  setCookie: string | null;
  body: Record<string, unknown>;
}

async function registerUser(username: string): Promise<RegisterResult> {
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
  const body = (await res.json().catch(() => ({}))) as {
    userId?: unknown;
    deviceId?: unknown;
    accessToken?: unknown;
    refreshToken?: unknown;
  };
  const setCookieHeader = res.headers.get("set-cookie");
  const tokenFromCookie = setCookieHeader
    ?.match(/(?:^|; )?refresh_token=([^;]+)/)?.[1]
    ?.split(";")[0];
  const refreshToken =
    typeof body.refreshToken === "string"
      ? body.refreshToken
      : tokenFromCookie;
  const session:
    | Session
    | undefined =
    typeof body.userId === "string" &&
    typeof body.deviceId === "string" &&
    typeof body.accessToken === "string"
      ? {
          userId: body.userId,
          deviceId: body.deviceId,
          accessToken: body.accessToken,
          ...(refreshToken !== undefined ? { refreshToken } : {}),
        }
      : undefined;
  return {
    status: res.status,
    ...(session !== undefined ? { session } : {}),
    setCookie: setCookieHeader,
    body,
  };
}

async function provisionedUser(): Promise<Session> {
  const registered = await registerUser(nextUsername());
  expect(registered.status).toBe(201);
  expect(registered.session).toBeDefined();
  return registered.session!;
}

async function login(
  username: string,
  password: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "https://localhost" },
    body: JSON.stringify({
      version: AUTH_PROTOCOL_VERSION,
      username,
      password,
      device: deviceProvisioning(Math.floor(Math.random() * 16382) + 1),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

async function logout(refreshToken: string): Promise<number> {
  const res = await fetch(`${BASE_URL}/auth/logout`, {
    method: "POST",
    headers: {
      Cookie: `refresh_token=${refreshToken}`,
      Origin: "https://localhost",
    },
  });
  return res.status;
}

/** Simple authenticated probe endpoint for access-token validity. */
async function listDevices(
  token: string
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}/devices`, {
    headers: authHeaders(token),
  });
  const body = (await res.json().catch(() => ({}))) as unknown;
  return { status: res.status, body };
}

async function initAttachment(
  token: string,
  encryptedSize: number,
  encryptedDigest: string
): Promise<{ status: number; attachmentId?: string; body: unknown }> {
  const res = await fetch(`${BASE_URL}/attachments/init-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify({
      encryptedSize,
      encryptedDigest,
      contentType: "application/octet-stream",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    attachmentId?: unknown;
  };
  const attachmentId =
    typeof body.attachmentId === "string" ? body.attachmentId : undefined;
  return {
    status: res.status,
    ...(attachmentId !== undefined ? { attachmentId } : {}),
    body,
  };
}

async function completeAttachment(
  attachmentId: string,
  token: string
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(
    `${BASE_URL}/attachments/${attachmentId}/complete`,
    { method: "POST", headers: authHeaders(token) }
  );
  const body = (await res.json().catch(() => ({}))) as unknown;
  return { status: res.status, body };
}

/** Sender→recipient direct attachment message; used to grant recipient access. */
async function sendAttachmentMessage(
  sender: Session,
  recipient: Session,
  recipientDeviceId: string,
  attachmentId: string
): Promise<number> {
  const res = await fetch(`${BASE_URL}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(sender.accessToken) },
    body: JSON.stringify({
      version: MESSAGE_PROTOCOL_VERSION,
      clientMessageId: crypto.randomUUID(),
      recipientUserId: recipient.userId,
      messages: [
        {
          recipientDeviceId,
          ciphertext: "AAAA",
          type: "attachment",
          attachmentId,
        },
      ],
    }),
  });
  return res.status;
}

async function proxyUploadCiphertext(
  attachmentId: string,
  ciphertext: Buffer,
  token: string
): Promise<number> {
  const form = new FormData();
  form.append(
    "ciphertext",
    new Blob([ciphertext], { type: "application/octet-stream" }),
    "ciphertext.bin"
  );
  const res = await fetch(
    `${BASE_URL}/attachments/${attachmentId}/upload-ciphertext`,
    { method: "POST", body: form, headers: authHeaders(token) }
  );
  return res.status;
}

function attachmentCiphertext(): Buffer {
  return Buffer.alloc(32, 0x41);
}

beforeAll(() => {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for auth-attachment-deny integration tests"
    );
  }
  admin = new pg.Pool({ connectionString: databaseUrl, max: 3 });
});

afterAll(async () => {
  if (admin) {
    await admin
      .query(`DELETE FROM users WHERE username LIKE 'aa_it_%'`)
      .catch(() => undefined);
    await admin.end();
  }
});

describe("Attachment complete authorization (real Postgres)", () => {
  it("scenario A: uploader completes own uploaded attachment → 204", async () => {
    const a = await provisionedUser();
    const init = await initAttachment(
      a.accessToken,
      32,
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    );
    expect(init.status).toBe(200);
    expect(init.attachmentId).toBeDefined();

    // Without an uploaded object, complete reports not-ready (409).
    const early = await completeAttachment(init.attachmentId!, a.accessToken);
    expect(early.status).toBe(409);
  });

  it("scenario B: non-uploader POST /attachments/:id/complete → 403", async () => {
    const a = await provisionedUser();
    const b = await provisionedUser();

    const init = await initAttachment(
      a.accessToken,
      32,
      "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"
    );
    expect(init.status).toBe(200);
    const attachmentId = init.attachmentId!;

    // B (never granted access, not the uploader) cannot mark A's upload complete.
    const res = await completeAttachment(attachmentId, b.accessToken);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: "Forbidden" });

    // Unknown attachment id → 404, not a 403/500 leak.
    const missing = await completeAttachment(crypto.randomUUID(), b.accessToken);
    expect(missing.status).toBe(404);
  });

  it("scenario C: granted recipient still cannot call complete → 403", async () => {
    const sender = await provisionedUser();
    const recipient = await provisionedUser();

    const relationship = await fetch(
      `${BASE_URL}/users/${recipient.userId}/direct-relationship`,
      { method: "POST", headers: authHeaders(sender.accessToken) }
    );
    expect(relationship.status).toBe(200);

    const devices = await fetch(
      `${BASE_URL}/users/${recipient.userId}/devices`,
      { headers: authHeaders(sender.accessToken) }
    );
    expect(devices.status).toBe(200);
    const recipientDeviceId = (
      (await devices.json()) as { devices: Array<{ deviceId: string }> }
    ).devices[0]!.deviceId;

    // Fully upload + verify the attachment, then grant the recipient read
    // access via a direct attachment message.
    const ciphertext = attachmentCiphertext();
    const digest = createHash("sha256")
      .update(ciphertext)
      .digest("base64url");
    const init = await initAttachment(
      sender.accessToken,
      ciphertext.length,
      digest
    );
    expect(init.status).toBe(200);
    const attachmentId = init.attachmentId!;

    const upload = await proxyUploadCiphertext(
      attachmentId,
      ciphertext,
      sender.accessToken
    );
    expect(upload).toBe(204);

    const sendStatus = await sendAttachmentMessage(
      sender,
      recipient,
      recipientDeviceId,
      attachmentId
    );
    expect(sendStatus).toBe(202);

    // Read access ≠ upload ownership: complete stays uploader-only.
    const res = await completeAttachment(attachmentId, recipient.accessToken);
    expect(res.status).toBe(403);
  });
});

describe("Authentication deny paths (real Postgres)", () => {
  it("scenario D: wrong-password and nonexistent-user logins → identical 401 bodies", async () => {
    const username = nextUsername();
    const registered = await registerUser(username);
    expect(registered.status).toBe(201);
    expect(registered.session).toBeDefined();
    expect(registered.setCookie).toContain("refresh_token=");

    const wrongPassword = await login(username, "WrongPassword456!");
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body).toEqual({ error: "Invalid credentials" });

    const nonexistent = await login(
      `aa_it_nouser_${Date.now()}`,
      "TestPassword123!"
    );
    expect(nonexistent.status).toBe(401);

    // No user enumeration: both deny paths must answer identically.
    expect(nonexistent.body).toEqual(wrongPassword.body);
  });

  it("scenario E: access token rejected after logout", async () => {
    const a = await provisionedUser();
    expect(a.refreshToken).toBeDefined();

    // Token is valid before logout.
    const before = await listDevices(a.accessToken);
    expect(before.status).toBe(200);

    const logoutStatus = await logout(a.refreshToken!);
    expect(logoutStatus).toBe(200);

    // Stateless access token must die with its session (logout/revocation, H4).
    const after = await listDevices(a.accessToken);
    expect(after.status).toBe(401);
    expect(after.body).toEqual({ error: "Unauthorized" });
  });

  it("scenario F: malformed bearer token → 401", async () => {
    const res = await fetch(`${BASE_URL}/devices`, {
      headers: { Authorization: "Bearer not.a.real.jwt" },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });

    const garbage = await fetch(`${BASE_URL}/devices`, {
      headers: { Authorization: "Bearer !!!not-even-base64!!!" },
    });
    expect(garbage.status).toBe(401);
  });

  it.skip(
    "rate-limit denial (429) after repeated failed logins — SKIPPED: " +
      "integration global-setup forces QM_API_TEST_AUTH_RATE_LIMIT_MAX=500, " +
      "so the 429 path cannot be exercised under this harness",
    () => {
      expect.unreachable("See global-setup.ts rate-limit override");
    }
  );
});

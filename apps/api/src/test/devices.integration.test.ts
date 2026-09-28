/**
 * HTTP-level integration tests for device management routes (GET /devices,
 * PUT /devices/crypto-material, DELETE /devices/:deviceId, and the user
 * device-directory endpoints) against a REAL Postgres. No DB mocks.
 *
 * Run (same pattern as the other integration suites, with a THROWAWAY DB):
 *   QM_API_INCLUDE_INTEGRATION_TESTS=1 \
 *   DATABASE_URL=postgresql://<user>:<password>@127.0.0.1:<port>/seclettr_devices_it \
 *   ALLOW_PUBLIC_REGISTRATION=true \
 *   pnpm --filter @seclettr/api exec vitest run src/test/devices.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import {
  AUTH_PROTOCOL_VERSION,
  DEVICES_PROTOCOL_VERSION,
} from "@seclettr/protocol";

const BASE_URL = process.env["API_URL"] ?? "http://localhost:3001";

// Direct DB handle for cleanup only (distinct prefix emails, same pattern as
// the other integration suites).
let admin: pg.Pool;

const FAKE_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const FAKE_SIG =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const ALT_KEY = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const ALT_SIG =
  "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

interface Session {
  userId: string;
  deviceId: string;
  accessToken: string;
}

interface DeviceEntry {
  deviceId: string;
  name: string | null;
  identityKeyPublic: string;
  signingKeyPublic: string;
  registrationId: number;
}

interface DeviceListBody {
  version: string;
  devices: DeviceEntry[];
}

function deviceProvisioning(registrationId: number) {
  return {
    name: "Devices IT Device",
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

async function loginDevice(username: string): Promise<Session> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
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
    throw new Error(`login failed: ${res.status}`);
  }
  expect(res.status).toBe(200);
  return {
    userId: body.userId,
    deviceId: body.deviceId,
    accessToken: body.accessToken,
  };
}

/** Register, then login a second device for the same user. */
async function provisionedTwoDeviceUser(): Promise<[Session, Session]> {
  const username = `dv_it_${Date.now()}_${usernameSeq++}_${Math.floor(Math.random() * 1e6)}`;
  const first = await registerUser(username);
  const second = await loginDevice(username);
  return [first, second];
}

let usernameSeq = 0;

async function provisionedUser(): Promise<Session> {
  const username = `dv_it_${Date.now()}_${usernameSeq++}_${Math.floor(Math.random() * 1e6)}`;
  return registerUser(username);
}

async function listDevices(session: Session): Promise<{
  status: number;
  body: DeviceListBody | { error: string };
}> {
  const res = await fetch(`${BASE_URL}/devices`, {
    headers: authHeaders(session.accessToken),
  });
  const body = (await res.json().catch(() => ({}))) as
    | DeviceListBody
    | { error: string };
  return { status: res.status, body };
}

async function deleteDevice(
  session: Session,
  deviceId: string
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}/devices/${deviceId}`, {
    method: "DELETE",
    headers: authHeaders(session.accessToken),
  });
  const body = (await res.json().catch(() => ({}))) as unknown;
  return { status: res.status, body };
}

async function putCryptoMaterial(
  session: Session,
  identityKeyPublic: string,
  signingKeyPublic: string
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}/devices/crypto-material`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(session.accessToken),
    },
    body: JSON.stringify({
      version: DEVICES_PROTOCOL_VERSION,
      identityKeyPublic,
      signingKeyPublic,
      signedPreKey: { id: 1, publicKey: FAKE_KEY, signature: FAKE_SIG },
    }),
  });
  const body = (await res.json().catch(() => ({}))) as unknown;
  return { status: res.status, body };
}

async function userDeviceList(
  requester: Session,
  targetUserId: string
): Promise<{ status: number; body: DeviceListBody | { error: string } }> {
  const res = await fetch(`${BASE_URL}/users/${targetUserId}/devices`, {
    headers: authHeaders(requester.accessToken),
  });
  const body = (await res.json().catch(() => ({}))) as
    | DeviceListBody
    | { error: string };
  return { status: res.status, body };
}

async function preKeyBundle(
  requester: Session,
  targetUserId: string,
  targetDeviceId: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(
    `${BASE_URL}/users/${targetUserId}/devices/${targetDeviceId}/prekey-bundle`,
    { headers: authHeaders(requester.accessToken) }
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

beforeAll(() => {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for devices integration tests");
  }
  admin = new pg.Pool({ connectionString: databaseUrl, max: 3 });
});

afterAll(async () => {
  if (admin) {
    await admin
      .query(`DELETE FROM users WHERE username LIKE 'dv_it_%'`)
      .catch(() => undefined);
    await admin.end();
  }
});

describe("Device management over HTTP (real Postgres)", () => {
  it("scenario a: register + second-device login → GET /devices shows both", async () => {
    const [first, second] = await provisionedTwoDeviceUser();
    const list = await listDevices(first);
    expect(list.status).toBe(200);
    const body = list.body as DeviceListBody;
    const ids = body.devices.map((d) => d.deviceId);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(first.deviceId);
    expect(ids).toContain(second.deviceId);
  });

  it("scenario b: isolation — B's device list shows only B", async () => {
    const a = await provisionedUser();
    const b = await provisionedUser();
    const bList = await listDevices(b);
    expect(bList.status).toBe(200);
    const devices = (bList.body as DeviceListBody).devices;
    expect(devices).toHaveLength(1);
    expect(devices[0]!.deviceId).toBe(b.deviceId);
    const aList = await listDevices(a);
    expect((aList.body as DeviceListBody).devices).toHaveLength(1);
    expect((aList.body as DeviceListBody).devices[0]!.deviceId).toBe(a.deviceId);
  });

  it("scenario c: B deletes A's device → 404, A's devices unchanged", async () => {
    const a = await provisionedUser();
    const b = await provisionedUser();
    const before = await listDevices(a);
    expect((before.body as DeviceListBody).devices).toHaveLength(1);

    const del = await deleteDevice(b, a.deviceId);
    expect(del.status).toBe(404);
    expect(del.body).toEqual({ error: "Device not found" });

    const after = await listDevices(a);
    expect((after.body as DeviceListBody).devices).toHaveLength(1);
    expect((after.body as DeviceListBody).devices[0]!.deviceId).toBe(a.deviceId);
  });

  it("scenario d: own non-current delete → 200 + gone from list + prekey 404; self-revoke → 400", async () => {
    const [first, second] = await provisionedTwoDeviceUser();

    // Non-current device delete succeeds.
    const del = await deleteDevice(first, second.deviceId);
    expect(del.status).toBe(200);
    const list = await listDevices(first);
    const ids = (list.body as DeviceListBody).devices.map((d) => d.deviceId);
    expect(ids).not.toContain(second.deviceId);
    expect(ids).toContain(first.deviceId);

    // Prekey bundle for the deleted device is gone.
    const bundle = await preKeyBundle(first, first.userId, second.deviceId);
    expect(bundle.status).toBe(404);

    // Revoking the current device is rejected.
    const selfDel = await deleteDevice(first, first.deviceId);
    expect(selfDel.status).toBe(400);
    expect(selfDel.body).toEqual({ error: "Cannot revoke the current device" });
  });

  it("scenario e: no auth header → 401", async () => {
    const res = await fetch(`${BASE_URL}/devices`);
    expect(res.status).toBe(401);
  });

  it("scenario f: B PUT crypto-material → 204, A's material unchanged (isolation)", async () => {
    const a = await provisionedUser();
    const b = await provisionedUser();

    const aBefore = (await listDevices(a)).body as DeviceListBody;
    const bBefore = (await listDevices(b)).body as DeviceListBody;
    expect(aBefore.devices[0]!.identityKeyPublic).toBe(FAKE_KEY);
    expect(bBefore.devices[0]!.identityKeyPublic).toBe(FAKE_KEY);

    const put = await putCryptoMaterial(b, ALT_KEY, ALT_KEY);
    expect(put.status).toBe(204);

    // B's own list reflects the update; A's row is untouched.
    const bAfter = (await listDevices(b)).body as DeviceListBody;
    expect(bAfter.devices[0]!.identityKeyPublic).toBe(ALT_KEY);
    const aAfter = (await listDevices(a)).body as DeviceListBody;
    expect(aAfter.devices[0]!.identityKeyPublic).toBe(FAKE_KEY);
  });

  it("scenario g: A requests B's device directory without relationship → 403", async () => {
    const a = await provisionedUser();
    const b = await provisionedUser();
    const res = await userDeviceList(a, b.userId);
    expect(res.status).toBe(403);
    expect((res.body as { error: string }).error).toBe(
      "Relationship or contact grant required"
    );
  });
});


/**
 * HTTP-level integration tests for groups membership authorization:
 * /groups (encrypted, versioned) and /plain/groups role/membership gates
 * against a REAL Postgres. No DB mocks.
 *
 * Roles: creator → "owner", initial invitees → "member".
 *
 * Run (same pattern as the other integration suites, with a THROWAWAY DB):
 *   QM_API_INCLUDE_INTEGRATION_TESTS=1 \
 *   DATABASE_URL=postgresql://<user>:<password>@127.0.0.1:<port>/seclettr_groups_it \
 *   ALLOW_PUBLIC_REGISTRATION=true \
 *   pnpm --filter @seclettr/api exec vitest run src/test/groups-membership.integration.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import {
  AUTH_PROTOCOL_VERSION,
  GROUPS_PROTOCOL_VERSION,
  PLAIN_PROTOCOL_VERSION,
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
}

interface GroupMemberWire {
  userId: string;
  username: string;
  joinedAt: string;
  role?: string;
}

interface GroupDetailWire {
  version: number;
  groupId: string;
  name: string;
  members: GroupMemberWire[];
}

function deviceProvisioning(registrationId: number) {
  return {
    name: "Groups IT Device",
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

async function registerUser(): Promise<Session> {
  const username = `grp_it_${Date.now()}_${usernameSeq++}_${Math.floor(
    Math.random() * 1e6
  )}`;
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

async function getJSON(
  path: string,
  token?: string
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: token ? authHeaders(token) : {},
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function sendJSON(
  method: string,
  path: string,
  token: string | undefined,
  payload: unknown
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? authHeaders(token) : {}),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

/** Create an encrypted group owned by `owner` that includes `members`. */
async function createGroup(
  owner: Session,
  name: string,
  members: Session[]
): Promise<{ groupId: string; body: any; status: number }> {
  const res = await sendJSON("POST", "/groups", owner.accessToken, {
    version: GROUPS_PROTOCOL_VERSION,
    name,
    memberUserIds: members.map((m) => m.userId),
  });
  expect(res.status).toBe(201);
  return { groupId: res.body.groupId as string, body: res.body, status: res.status };
}

beforeAll(() => {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for groups integration tests");
  }
  admin = new pg.Pool({ connectionString: databaseUrl, max: 3 });
});

afterAll(async () => {
  if (admin) {
    // plain_groups.creator_id is ON DELETE RESTRICT and plain_messages sender
    // is RESTRICT, so remove plain groups (cascades members + messages) first,
    // then encrypted groups, then the users themselves.
    await admin
      .query(`DELETE FROM plain_groups WHERE name LIKE 'grp_it_%'`)
      .catch(() => undefined);
    await admin
      .query(`DELETE FROM groups WHERE name LIKE 'grp_it_%'`)
      .catch(() => undefined);
    await admin
      .query(`DELETE FROM users WHERE username LIKE 'grp_it_%'`)
      .catch(() => undefined);
    await admin.end();
  }
});

describe("Encrypted groups membership authorization over HTTP (real Postgres)", () => {
  it("scenario a: creator adds B at create time → B sees the group and member roles", async () => {
    const [a, b] = await Promise.all([registerUser(), registerUser()]);
    const { groupId, body } = await createGroup(a, "grp_it Alpha", [b]);

    expect(body.version).toBe(GROUPS_PROTOCOL_VERSION);
    expect(body.members).toHaveLength(2);
    const roleByUser = new Map<string, string | undefined>(
      body.members.map((m: GroupMemberWire) => [m.userId, m.role])
    );
    expect(roleByUser.get(a.userId)).toBe("owner");
    expect(roleByUser.get(b.userId)).toBe("member");

    // B can read the group detail.
    const bDetail = await getJSON(`/groups/${groupId}`, b.accessToken);
    expect(bDetail.status).toBe(200);
    expect((bDetail.body as GroupDetailWire).groupId).toBe(groupId);
    expect((bDetail.body as GroupDetailWire).members).toHaveLength(2);

    // B's list includes the group.
    const bList = await getJSON("/groups", b.accessToken);
    expect(bList.status).toBe(200);
    const listed = (bList.body.groups as Array<{ groupId: string }>).map(
      (g) => g.groupId
    );
    expect(listed).toContain(groupId);
  });

  it("scenario b: plain member B denied privileged ops (add C, remove A, promote self)", async () => {
    const [a, b, c] = await Promise.all([
      registerUser(),
      registerUser(),
      registerUser(),
    ]);
    const { groupId } = await createGroup(a, "grp_it Beta", [b]);

    // B (role "member") cannot add C.
    const add = await sendJSON(
      "POST",
      `/groups/${groupId}/members`,
      b.accessToken,
      { version: GROUPS_PROTOCOL_VERSION, userIds: [c.userId] }
    );
    expect(add.status).toBe(403);
    expect(add.body).toEqual({ error: "Insufficient group permissions" });

    // C must not have been added by B's denied attempt.
    const aDetail = await getJSON(`/groups/${groupId}`, a.accessToken);
    const memberIds = (aDetail.body.members as GroupMemberWire[]).map(
      (m) => m.userId
    );
    expect(memberIds).not.toContain(c.userId);

    // B cannot remove the owner A.
    const removeA = await sendJSON(
      "DELETE",
      `/groups/${groupId}/members/${a.userId}`,
      b.accessToken
    );
    expect(removeA.status).toBe(403);
    expect(removeA.body).toEqual({ error: "Insufficient group permissions" });

    // B cannot promote itself (only owner may change roles).
    const promote = await sendJSON(
      "PUT",
      `/groups/${groupId}/members/${b.userId}/role`,
      b.accessToken,
      { version: GROUPS_PROTOCOL_VERSION, role: "admin" }
    );
    expect(promote.status).toBe(403);
    expect(promote.body).toEqual({ error: "Only owner can update member roles" });

    // Owner A cannot remove itself while it is the last owner.
    const selfRemove = await sendJSON(
      "DELETE",
      `/groups/${groupId}/members/${a.userId}`,
      a.accessToken
    );
    expect(selfRemove.status).toBe(400);
    expect(selfRemove.body).toEqual({ error: "Group must have at least one owner" });
  });

  it("scenario c: A removes B → B loses read/access, list no longer shows the group", async () => {
    const [a, b] = await Promise.all([registerUser(), registerUser()]);
    const { groupId } = await createGroup(a, "grp_it Gamma", [b]);

    const removal = await sendJSON(
      "DELETE",
      `/groups/${groupId}/members/${b.userId}`,
      a.accessToken
    );
    expect(removal.status).toBe(200);
    expect(removal.body.ok).toBe(true);
    expect(typeof removal.body.cryptoEpoch).toBe("number");

    const bDetail = await getJSON(`/groups/${groupId}`, b.accessToken);
    expect(bDetail.status).toBe(403);
    expect(bDetail.body).toEqual({ error: "Not a group member" });

    const bDevices = await getJSON(`/groups/${groupId}/member-devices`, b.accessToken);
    expect(bDevices.status).toBe(403);

    const bList = await getJSON("/groups", b.accessToken);
    const listed = (bList.body.groups as Array<{ groupId: string }>).map(
      (g) => g.groupId
    );
    expect(listed).not.toContain(groupId);

    // A still sees the group with B gone.
    const aDetail = await getJSON(`/groups/${groupId}`, a.accessToken);
    expect(aDetail.status).toBe(200);
    expect((aDetail.body.members as GroupMemberWire[]).map((m) => m.userId)).toEqual([
      a.userId,
    ]);
  });

  it("scenario d: outsider C denied read and member ops on A's group", async () => {
    const [a, b, c] = await Promise.all([
      registerUser(),
      registerUser(),
      registerUser(),
    ]);
    // memberUserIds requires at least one entry; B is a member, C stays outsider.
    const { groupId } = await createGroup(a, "grp_it Delta", [b]);

    const detail = await getJSON(`/groups/${groupId}`, c.accessToken);
    expect(detail.status).toBe(403);
    expect(detail.body).toEqual({ error: "Not a group member" });

    const devices = await getJSON(`/groups/${groupId}/member-devices`, c.accessToken);
    expect(devices.status).toBe(403);

    const add = await sendJSON(
      "POST",
      `/groups/${groupId}/members`,
      c.accessToken,
      { version: GROUPS_PROTOCOL_VERSION, userIds: [c.userId] }
    );
    expect(add.status).toBe(403);
    expect(add.body).toEqual({ error: "Not a group member" });

    const cList = await getJSON("/groups", c.accessToken);
    const listed = (cList.body.groups as Array<{ groupId: string }>).map(
      (g) => g.groupId
    );
    expect(listed).not.toContain(groupId);
  });

  it("scenario e: unauthenticated requests → 401", async () => {
    const noAuthList = await getJSON("/groups");
    expect(noAuthList.status).toBe(401);

    const noAuthDetail = await getJSON("/groups/00000000-0000-4000-8000-000000000000");
    expect(noAuthDetail.status).toBe(401);

    const noAuthCreate = await sendJSON("POST", "/groups", undefined, {
      version: GROUPS_PROTOCOL_VERSION,
      name: "grp_it nope",
      memberUserIds: ["00000000-0000-4000-8000-000000000000"],
    });
    expect(noAuthCreate.status).toBe(401);
  });
});

describe("Plain groups membership authorization over HTTP (real Postgres)", () => {
  it("member ops gated by role; removal revokes read access; outsider denied", async () => {
    const [a, b, c] = await Promise.all([
      registerUser(),
      registerUser(),
      registerUser(),
    ]);
    const create = await sendJSON("POST", "/plain/groups", a.accessToken, {
      version: PLAIN_PROTOCOL_VERSION,
      name: "grp_it Plain",
      memberUserIds: [b.userId],
    });
    expect(create.status).toBe(201);
    const groupId = create.body.id as string;
    const roles = new Map<string, string>(
      (create.body.members as Array<{ userId: string; role: string }>).map(
        (m) => [m.userId, m.role]
      )
    );
    expect(roles.get(a.userId)).toBe("owner");
    expect(roles.get(b.userId)).toBe("member");

    // B (member) cannot add C.
    const add = await sendJSON(
      "POST",
      `/plain/groups/${groupId}/members`,
      b.accessToken,
      { version: PLAIN_PROTOCOL_VERSION, userId: c.userId }
    );
    expect(add.status).toBe(403);
    expect(add.body).toEqual({ error: "Insufficient role" });

    // B (member) cannot rename the group.
    const rename = await sendJSON(
      "PATCH",
      `/plain/groups/${groupId}`,
      b.accessToken,
      { version: PLAIN_PROTOCOL_VERSION, name: "grp_it Hacked" }
    );
    expect(rename.status).toBe(403);
    expect(rename.body).toEqual({ error: "Insufficient role" });

    // Outsider C cannot read the group or list it.
    const cDetail = await getJSON(`/plain/groups/${groupId}`, c.accessToken);
    expect(cDetail.status).toBe(403);
    expect(cDetail.body).toEqual({ error: "Not a member" });
    const cList = await getJSON("/plain/groups", c.accessToken);
    const listed = (cList.body.groups as Array<{ id: string }>).map((g) => g.id);
    expect(listed).not.toContain(groupId);

    // A removes B → B loses access; A's removal of the last owner is refused.
    const removeB = await sendJSON(
      "DELETE",
      `/plain/groups/${groupId}/members/${b.userId}`,
      a.accessToken
    );
    expect(removeB.status).toBe(204);
    const bDetail = await getJSON(`/plain/groups/${groupId}`, b.accessToken);
    expect(bDetail.status).toBe(403);

    const removeLastOwner = await sendJSON(
      "DELETE",
      `/plain/groups/${groupId}/members/${a.userId}`,
      a.accessToken
    );
    expect(removeLastOwner.status).toBe(409);
  });

  it("unauthenticated plain groups access → 401", async () => {
    const noAuthList = await getJSON("/plain/groups");
    expect(noAuthList.status).toBe(401);

    const noAuthCreate = await sendJSON("POST", "/plain/groups", undefined, {
      version: PLAIN_PROTOCOL_VERSION,
      name: "grp_it nope",
      memberUserIds: ["00000000-0000-4000-8000-000000000000"],
    });
    expect(noAuthCreate.status).toBe(401);
  });
});

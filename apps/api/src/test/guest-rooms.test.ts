import { beforeAll, describe, expect, it } from "vitest";
import {
  AUTH_PROTOCOL_VERSION,
  ROOMS_PROTOCOL_VERSION,
  RoomCreateResponseSchema,
  RoomJoinResponseSchema,
  RoomJoinPreviewResponseSchema,
} from "@seclettr/protocol";

const BASE_URL = process.env["API_URL"] ?? "http://localhost:3001";

async function apiRequest(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<{ status: number; body: unknown }> {
  const headers = new Headers(options.headers);
  if (
    !headers.has("Content-Type") &&
    options.body !== undefined &&
    options.body !== null
  ) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const responseBody = await res.json().catch(() => ({}));
  return { status: res.status, body: responseBody };
}

const FAKE_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const FAKE_SIG =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

async function registerUser(username: string) {
  return apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      version: AUTH_PROTOCOL_VERSION,
      username,
      password: "TestPassword123!",
      device: {
        name: "Guest Room Device",
        identityKeyPublic: FAKE_KEY,
        signingKeyPublic: FAKE_KEY,
        registrationId: Math.floor(Math.random() * 16382) + 1,
        signedPreKey: { id: 1, publicKey: FAKE_KEY, signature: FAKE_SIG },
        oneTimePreKeys: Array.from({ length: 5 }, (_, index) => ({
          id: index + 1,
          publicKey: FAKE_KEY,
        })),
      },
    }),
  });
}

async function createRoom(token: string): Promise<string> {
  const created = await apiRequest(
    "/rooms",
    {
      method: "POST",
      body: JSON.stringify({ callType: "audio", expiresInMinutes: 30 }),
    },
    token
  );
  expect(created.status).toBe(200);
  return (created.body as { inviteToken: string }).inviteToken;
}

describe("guest rooms", () => {
  beforeAll(async () => {
    const owner = await registerUser(`guest_room_owner_${Date.now()}`);
    expect(owner.status).toBe(201);
  });

  it("creates a room, exposes a preview, and issues a decodable guest session id", async () => {
    const owner = await registerUser(`guest_room_full_${Date.now()}`);
    const ownerToken = (owner.body as { accessToken: string }).accessToken;
    const inviteToken = await createRoom(ownerToken);

    const preview = await apiRequest(`/rooms/join/${inviteToken}`);
    expect(preview.status).toBe(200);
    expect(() =>
      RoomJoinPreviewResponseSchema.parse({
        version: ROOMS_PROTOCOL_VERSION,
        ...(preview.body as Record<string, unknown>),
      })
    ).not.toThrow();

    const join = await apiRequest(`/rooms/join/${inviteToken}`, {
      method: "POST",
      body: JSON.stringify({ guestName: "Гость-Кириллица-🎥" }),
    });
    expect(join.status).toBe(200);
    const parsed = RoomJoinResponseSchema.parse({
      version: ROOMS_PROTOCOL_VERSION,
      ...(join.body as Record<string, unknown>),
    });

    // The server must return a directly usable guestSessionId instead of
    // forcing the client to decode a base64url JWT payload with atob().
    expect(parsed.guestSessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(parsed.guestToken).toBeTruthy();
    expect(parsed.callId).toBe((preview.body as { callId: string }).callId);

    // sfuUrl is optional; when present it must be an absolute URL.
    if (parsed.sfuUrl !== undefined) {
      expect(parsed.sfuUrl).toMatch(/^https?:\/\//);
    }

    // Guest can access SFU for their room.
    const sfuAccess = await apiRequest(
      `/calls/${parsed.callId}/sfu-access`,
      {},
      parsed.guestToken
    );
    expect(sfuAccess.status).toBe(200);

    // Guest session id is what SFU uses as userId.
    const joinPresence = await apiRequest(
      `/rooms/${parsed.callId}/participants`,
      { method: "POST" },
      parsed.guestToken
    );
    expect(joinPresence.status).toBe(204);

    const roster = await apiRequest(
      `/rooms/${parsed.callId}/participants`,
      {},
      ownerToken
    );
    expect(roster.status).toBe(200);
    expect(
      (roster.body as { participants: Array<{ displayName: string }> }).participants
    ).toContainEqual(
      expect.objectContaining({ displayName: "Гость-Кириллица-🎥" })
    );

    // Host can kick the guest; afterwards the guest token must be rejected.
    const kick = await apiRequest(
      `/rooms/${parsed.callId}/guests/${parsed.guestSessionId}`,
      { method: "DELETE" },
      ownerToken
    );
    expect(kick.status).toBe(204);

    const sfuAccessAfterKick = await apiRequest(
      `/calls/${parsed.callId}/sfu-access`,
      {},
      parsed.guestToken
    );
    expect(sfuAccessAfterKick.status).toBe(403);

    const roomSfuAccessAfterKick = await apiRequest(
      `/rooms/${parsed.callId}/sfu-access`,
      {},
      parsed.guestToken
    );
    expect(roomSfuAccessAfterKick.status).toBe(403);
  });

  it("closing the room rejects the guest and hides the invite", async () => {
    const owner = await registerUser(`guest_room_close_${Date.now()}`);
    const ownerToken = (owner.body as { accessToken: string }).accessToken;
    const inviteToken = await createRoom(ownerToken);

    const join = await apiRequest(`/rooms/join/${inviteToken}`, {
      method: "POST",
      body: JSON.stringify({ guestName: "Closing Guest" }),
    });
    expect(join.status).toBe(200);
    const callId = (join.body as { callId: string }).callId;
    const guestToken = (join.body as { guestToken: string }).guestToken;

    const close = await apiRequest(
      `/rooms/${callId}`,
      { method: "DELETE" },
      ownerToken
    );
    expect(close.status).toBe(204);

    const sfuAccess = await apiRequest(
      `/calls/${callId}/sfu-access`,
      {},
      guestToken
    );
    expect(sfuAccess.status).toBe(404);

    const previewAfterClose = await apiRequest(`/rooms/join/${inviteToken}`);
    expect(previewAfterClose.status).toBe(404);
  });

  it("rejects a guest token used against a different room", async () => {
    const owner = await registerUser(`guest_room_cross_${Date.now()}`);
    const ownerToken = (owner.body as { accessToken: string }).accessToken;
    const inviteA = await createRoom(ownerToken);
    const inviteB = await createRoom(ownerToken);

    const joinA = await apiRequest(`/rooms/join/${inviteA}`, {
      method: "POST",
      body: JSON.stringify({ guestName: "Cross Guest" }),
    });
    const guestTokenA = (joinA.body as { guestToken: string }).guestToken;

    const previewB = await apiRequest(`/rooms/join/${inviteB}`);
    const callIdB = (previewB.body as { callId: string }).callId;

    const crossAccess = await apiRequest(
      `/calls/${callIdB}/sfu-access`,
      {},
      guestTokenA
    );
    expect(crossAccess.status).toBe(403);
  });

  it("issues TURN credentials to a live-room guest and denies stale guests", async () => {
    const owner = await registerUser(`guest_room_turn_${Date.now()}`);
    const ownerToken = (owner.body as { accessToken: string }).accessToken;
    const inviteToken = await createRoom(ownerToken);

    const join = await apiRequest(`/rooms/join/${inviteToken}`, {
      method: "POST",
      body: JSON.stringify({ guestName: "Turn Guest" }),
    });
    expect(join.status).toBe(200);
    const parsed = RoomJoinResponseSchema.parse({
      version: ROOMS_PROTOCOL_VERSION,
      ...(join.body as Record<string, unknown>),
    });

    // Live room + live guest row: credentials issued.
    const turn = await apiRequest("/calls/turn-credentials", {}, parsed.guestToken);
    expect(turn.status).toBe(200);
    const turnBody = (turn.body as { username?: string; ttl?: number; uris?: string[] });
    expect(turnBody.username).toContain(parsed.guestSessionId);
    expect(turnBody.ttl).toBe(86400);
    expect(Array.isArray(turnBody.uris)).toBe(true);

    // Unauthenticated request stays denied.
    const noAuth = await apiRequest("/calls/turn-credentials");
    expect(noAuth.status).toBe(401);

    // Kicked guest (room_guest_sessions row removed) → denied.
    await apiRequest(
      `/rooms/${parsed.callId}/guests/${parsed.guestSessionId}`,
      { method: "DELETE" },
      ownerToken
    );
    const turnAfterKick = await apiRequest("/calls/turn-credentials", {}, parsed.guestToken);
    expect(turnAfterKick.status).toBe(403);

    // Ended room (fresh guest, room closed) → not found.
    const invite2 = await createRoom(ownerToken);
    const join2 = await apiRequest(`/rooms/join/${invite2}`, {
      method: "POST",
      body: JSON.stringify({ guestName: "Turn Guest 2" }),
    });
    expect(join2.status).toBe(200);
    const parsed2 = RoomJoinResponseSchema.parse({
      version: ROOMS_PROTOCOL_VERSION,
      ...(join2.body as Record<string, unknown>),
    });
    const close = await apiRequest(
      `/rooms/${parsed2.callId}`,
      { method: "DELETE" },
      ownerToken
    );
    expect(close.status).toBe(204);
    const turnAfterClose = await apiRequest("/calls/turn-credentials", {}, parsed2.guestToken);
    expect(turnAfterClose.status).toBe(404);
  });

  it("keeps access-token TURN credentials working alongside guest tokens", async () => {
    const owner = await registerUser(`guest_turn_auth_${Date.now()}`);
    const ownerToken = (owner.body as { accessToken: string }).accessToken;

    const turn = await apiRequest("/calls/turn-credentials", {}, ownerToken);
    expect(turn.status).toBe(200);
    const turnBody = (turn.body as { username?: string; ttl?: number });
    expect(typeof turnBody.username).toBe("string");
    expect(turnBody.ttl).toBe(86400);
  });

  it("parses a room create response through the versioned schema", async () => {
    const owner = await registerUser(`guest_room_schema_${Date.now()}`);
    const ownerToken = (owner.body as { accessToken: string }).accessToken;
    const created = await apiRequest(
      "/rooms",
      {
        method: "POST",
        body: JSON.stringify({ callType: "video", expiresInMinutes: 15 }),
      },
      ownerToken
    );
    expect(created.status).toBe(200);
    const parsed = RoomCreateResponseSchema.parse({
      version: ROOMS_PROTOCOL_VERSION,
      ...(created.body as Record<string, unknown>),
    });
    expect(parsed.inviteToken).toBeTruthy();
    expect(parsed.inviteUrl).toContain(parsed.inviteToken);
  });
});
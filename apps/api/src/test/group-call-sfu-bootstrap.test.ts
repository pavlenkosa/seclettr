import { describe, expect, it } from "vitest";
import {
  AUTH_PROTOCOL_VERSION,
  GROUPS_PROTOCOL_VERSION,
  SfuRtpCapabilitiesResponseSchema,
} from "@seclettr/protocol";

const BASE_URL = process.env["API_URL"] ?? "http://127.0.0.1:3301";
const SFU_URL = process.env["SFU_URL"] ?? "http://127.0.0.1:3302";

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
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const rawBody = await response.text();
  if (rawBody.trim().length === 0) {
    return { status: response.status, body: {} };
  }
  return {
    status: response.status,
    body: JSON.parse(rawBody) as unknown,
  };
}

async function registerUser(username: string) {
  const fakeKey = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const fakeSig =
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  return apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({
      version: AUTH_PROTOCOL_VERSION,
      username,
      password: "TestPassword123!",
      device: {
        name: "Group Call SFU Device",
        identityKeyPublic: fakeKey,
        signingKeyPublic: fakeKey,
        registrationId: Math.floor(Math.random() * 16382) + 1,
        signedPreKey: {
          id: 1,
          publicKey: fakeKey,
          signature: fakeSig,
        },
        oneTimePreKeys: Array.from({ length: 5 }, (_, index) => ({
          id: index + 1,
          publicKey: fakeKey,
        })),
      },
    }),
  });
}

describe("group-call SFU bootstrap", () => {
  it("boots a real group call through the SFU and converges after the last participant leaves", async () => {
    const owner = await registerUser(`gc_sfu_owner_${Date.now()}`);
    expect(owner.status).toBe(201);
    const ownerToken = (owner.body as { accessToken: string }).accessToken;
    const ownerUserId = (owner.body as { userId: string }).userId;
    const ownerDeviceId = (owner.body as { deviceId: string }).deviceId;

    const member = await registerUser(`gc_sfu_member_${Date.now()}`);
    expect(member.status).toBe(201);
    const memberUserId = (member.body as { userId: string }).userId;

    const group = await apiRequest(
      "/groups",
      {
        method: "POST",
        body: JSON.stringify({
          version: GROUPS_PROTOCOL_VERSION,
          name: "Group Call SFU Bootstrap",
          memberUserIds: [memberUserId],
        }),
      },
      ownerToken
    );
    expect(group.status).toBe(201);
    const groupId = (group.body as { groupId: string }).groupId;

    const createCall = await apiRequest(
      "/calls",
      {
        method: "POST",
        body: JSON.stringify({
          groupId,
          callType: "audio",
        }),
      },
      ownerToken
    );
    expect(createCall.status).toBe(200);
    const callId = (createCall.body as { callId: string }).callId;

    const join = await apiRequest(
      `/calls/${callId}/participants`,
      { method: "POST" },
      ownerToken
    );
    expect(join.status).toBe(200);
    expect(
      (join.body as { participants: Array<{ userId: string }> }).participants
    ).toEqual([{ userId: ownerUserId, username: expect.any(String) }]);

    const participantDevices = await apiRequest(
      `/calls/${callId}/participant-devices`,
      {},
      ownerToken
    );
    expect(participantDevices.status).toBe(200);
    expect(
      (
        participantDevices.body as {
          participantDevices: Array<{ userId: string; deviceId: string }>;
        }
      ).participantDevices
    ).toContainEqual({
      userId: ownerUserId,
      deviceId: ownerDeviceId,
    });

    const sfuResponse = await fetch(
      `${SFU_URL}/rooms/${encodeURIComponent(callId)}/rtp-capabilities`,
      {
        headers: {
          Authorization: `Bearer ${ownerToken}`,
        },
      }
    );
    expect(sfuResponse.status).toBe(200);
    const sfuBody = (await sfuResponse.json()) as unknown;
    const parsedSfuBody = SfuRtpCapabilitiesResponseSchema.safeParse(sfuBody);
    expect(parsedSfuBody.success).toBe(true);
    expect(parsedSfuBody.data?.rtpCapabilities.codecs.length).toBeGreaterThan(0);

    const leave = await apiRequest(
      `/calls/${callId}/participants/me`,
      { method: "DELETE" },
      ownerToken
    );
    expect(leave.status).toBe(200);
    expect(leave.body).toEqual({ ok: true });

    const activeCall = await apiRequest(
      `/groups/${groupId}/active-call`,
      {},
      ownerToken
    );
    expect(activeCall.status).toBe(404);

    const rosterAfterLeave = await apiRequest(
      `/calls/${callId}/participant-devices`,
      {},
      ownerToken
    );
    expect(rosterAfterLeave.status).toBe(404);
  });
});

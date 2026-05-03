import { describe, expect, it } from "vitest";
import {
  GROUPS_PROTOCOL_VERSION,
  GroupHistoryResponseSchema,
  MESSAGE_PROTOCOL_VERSION,
  SendGroupMessageResponseSchema,
} from "@seclettr/protocol";

const BASE_URL = process.env["API_URL"] ?? "http://127.0.0.1:3301";

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
      version: 1,
      username,
      password: "TestPassword123!",
      device: {
        name: "Group History Device",
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

describe("group history contract", () => {
  it("returns the canonical versioned camelCase DTO", async () => {
    const owner = await registerUser(`gh_contract_owner_${Date.now()}`);
    expect(owner.status).toBe(201);
    const ownerToken = (owner.body as { accessToken: string }).accessToken;

    const member = await registerUser(`gh_contract_member_${Date.now()}`);
    expect(member.status).toBe(201);
    const memberUserId = (member.body as { userId: string }).userId;
    const memberToken = (member.body as { accessToken: string }).accessToken;

    const group = await apiRequest(
      "/groups",
      {
        method: "POST",
        body: JSON.stringify({
          version: GROUPS_PROTOCOL_VERSION,
          name: "History Contract",
          memberUserIds: [memberUserId],
        }),
      },
      ownerToken
    );
    expect(group.status).toBe(201);
    const groupId = (group.body as { groupId: string }).groupId;

    const send = await apiRequest(
      `/groups/${groupId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          version: MESSAGE_PROTOCOL_VERSION,
          clientMessageId: crypto.randomUUID(),
          groupId,
          distributionId: crypto.randomUUID(),
          chainId: 0,
          messageId: 1,
          ciphertext: "AAAA",
          signature: "BBBB",
          type: "text",
        }),
      },
      ownerToken
    );
    expect(send.status).toBe(202);
    const parsedSend = SendGroupMessageResponseSchema.safeParse(send.body);
    expect(parsedSend.success).toBe(true);
    expect(parsedSend.data?.serverMessageId).toEqual(expect.any(String));
    expect(parsedSend.data?.createdAt).toEqual(expect.any(String));

    const history = await apiRequest(
      `/groups/${groupId}/messages?limit=10`,
      {},
      memberToken
    );
    expect(history.status).toBe(200);

    const parsed = GroupHistoryResponseSchema.safeParse(history.body);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.messages.length).toBeGreaterThan(0);
    expect((history.body as { version?: number }).version).toBe(
      GROUPS_PROTOCOL_VERSION
    );

    const first = parsed.data!.messages[0]!;
    expect(typeof first.senderDeviceId).toBe("string");
    expect(typeof first.distributionId).toBe("string");
    expect(first.cryptoEpoch).toBe(1);
    expect(first.messageType).toBe("text");
    expect(
      (history.body as { messages: Array<Record<string, unknown>> }).messages[0]?.[
        "sender_device_id"
      ]
    ).toBeUndefined();
    expect(
      (history.body as { messages: Array<Record<string, unknown>> }).messages[0]?.[
        "created_at"
      ]
    ).toBeUndefined();
  });
});

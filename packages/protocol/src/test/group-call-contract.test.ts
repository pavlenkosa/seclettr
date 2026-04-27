import { describe, expect, it } from "vitest";
import {
  GROUPS_PROTOCOL_VERSION,
  GroupActiveCallSchema,
  GroupCallJoinResponseSchema,
  GroupCallParticipantDevicesResponseSchema,
  GroupCallParticipantsResponseSchema,
  GroupMemberDevicesResponseSchema,
} from "../groups.js";

describe("GroupActiveCallSchema", () => {
  it("accepts the canonical active group call DTO", () => {
    const parsed = GroupActiveCallSchema.safeParse({
      version: GROUPS_PROTOCOL_VERSION,
      callId: "11111111-1111-4111-8111-111111111111",
      callType: "video",
      status: "active",
      callerUserId: "22222222-2222-4222-8222-222222222222",
      createdAt: "2026-02-28T00:00:00.000Z",
      answeredAt: "2026-02-28T00:00:01.000Z",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects ended calls from the active-call contract", () => {
    const parsed = GroupActiveCallSchema.safeParse({
      version: GROUPS_PROTOCOL_VERSION,
      callId: "11111111-1111-4111-8111-111111111111",
      callType: "audio",
      status: "ended",
      callerUserId: "22222222-2222-4222-8222-222222222222",
      createdAt: "2026-02-28T00:00:00.000Z",
      answeredAt: null,
    });

    expect(parsed.success).toBe(false);
  });
});

describe("GroupMemberDevicesResponseSchema", () => {
  it("accepts the canonical group member device batch DTO", () => {
    const parsed = GroupMemberDevicesResponseSchema.safeParse({
      version: GROUPS_PROTOCOL_VERSION,
      members: [
        {
          userId: "22222222-2222-4222-8222-222222222222",
          devices: [
            {
              deviceId: "33333333-3333-4333-8333-333333333333",
              identityKeyPublic: "identity-key",
              signingKeyPublic: "signing-key",
            },
          ],
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects legacy snake_case member-device payloads", () => {
    const parsed = GroupMemberDevicesResponseSchema.safeParse({
      version: GROUPS_PROTOCOL_VERSION,
      members: [
        {
          user_id: "22222222-2222-4222-8222-222222222222",
          devices: [
            {
              device_id: "33333333-3333-4333-8333-333333333333",
              identity_key_public: "identity-key",
              signing_key_public: "signing-key",
            },
          ],
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });
});

describe("GroupCallParticipantsResponseSchema", () => {
  it("accepts the canonical group-call participant roster DTO", () => {
    const parsed = GroupCallParticipantsResponseSchema.safeParse({
      version: GROUPS_PROTOCOL_VERSION,
      participants: [
        {
          userId: "22222222-2222-4222-8222-222222222222",
          username: "alice",
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects legacy snake_case participant roster payloads", () => {
    const parsed = GroupCallParticipantsResponseSchema.safeParse({
      version: GROUPS_PROTOCOL_VERSION,
      participants: [
        {
          user_id: "22222222-2222-4222-8222-222222222222",
          username: "alice",
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });
});

describe("GroupCallParticipantDevicesResponseSchema", () => {
  it("accepts the canonical group-call participant-device roster DTO", () => {
    const parsed = GroupCallParticipantDevicesResponseSchema.safeParse({
      version: GROUPS_PROTOCOL_VERSION,
      participantDevices: [
        {
          userId: "22222222-2222-4222-8222-222222222222",
          deviceId: "33333333-3333-4333-8333-333333333333",
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});

describe("GroupCallJoinResponseSchema", () => {
  it("accepts the canonical group-call join response DTO", () => {
    const parsed = GroupCallJoinResponseSchema.safeParse({
      version: GROUPS_PROTOCOL_VERSION,
      ok: true,
      participants: [
        {
          userId: "22222222-2222-4222-8222-222222222222",
          username: "alice",
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});

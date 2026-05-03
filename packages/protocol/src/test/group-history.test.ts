import { describe, expect, it } from "vitest";
import { GROUPS_PROTOCOL_VERSION } from "../common.js";
import { GroupHistoryResponseSchema } from "../groups.js";

describe("GroupHistoryResponseSchema", () => {
  it("accepts the canonical camelCase group history DTO", () => {
    const parsed = GroupHistoryResponseSchema.safeParse({
      version: GROUPS_PROTOCOL_VERSION,
      messages: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          senderDeviceId: "22222222-2222-4222-8222-222222222222",
          distributionId: "33333333-3333-4333-8333-333333333333",
          cryptoEpoch: 1,
          chainId: 0,
          messageId: 1,
          messageType: "text",
          ciphertext: "AAAA",
          signature: "BBBB",
          createdAt: "2026-02-28T00:00:00.000Z",
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects legacy snake_case payloads", () => {
    const parsed = GroupHistoryResponseSchema.safeParse({
      version: GROUPS_PROTOCOL_VERSION,
      messages: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          sender_device_id: "22222222-2222-4222-8222-222222222222",
          distribution_id: "33333333-3333-4333-8333-333333333333",
          chain_id: 0,
          message_id: 1,
          message_type: "text",
          ciphertext: "AAAA",
          signature: "BBBB",
          created_at: "2026-02-28T00:00:00.000Z",
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });
});

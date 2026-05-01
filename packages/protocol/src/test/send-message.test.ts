import { describe, expect, it } from "vitest";
import {
  MESSAGE_PROTOCOL_VERSION,
  PlaintextSenderKeyDistributionMessageSchema,
  SendGroupMessageRequestSchema,
  SendMessageRequestSchema,
  SendMessageResponseSchema,
} from "../messages.js";

const uuidA = "11111111-1111-4111-8111-111111111111";
const uuidB = "22222222-2222-4222-8222-222222222222";
const uuidC = "33333333-3333-4333-8333-333333333333";

function withMessageVersion<T extends Record<string, unknown>>(payload: T) {
  return {
    version: MESSAGE_PROTOCOL_VERSION,
    ...payload,
  };
}

describe("SendMessageRequestSchema", () => {
  it("accepts text envelope without attachmentId", () => {
    const parsed = SendMessageRequestSchema.safeParse(
      withMessageVersion({
        clientMessageId: uuidA,
        recipientUserId: uuidB,
        messages: [
          {
            recipientDeviceId: uuidC,
            ciphertext: "AAAA",
            type: "text",
          },
        ],
      })
    );
    expect(parsed.success).toBe(true);
  });

  it("accepts attachment envelope with attachmentId", () => {
    const parsed = SendMessageRequestSchema.safeParse(
      withMessageVersion({
        clientMessageId: uuidA,
        recipientUserId: uuidB,
        messages: [
          {
            recipientDeviceId: uuidC,
            ciphertext: "BBBB",
            type: "attachment",
            attachmentId: uuidA,
          },
        ],
      })
    );
    expect(parsed.success).toBe(true);
  });

  it("rejects attachment envelope without attachmentId", () => {
    const parsed = SendMessageRequestSchema.safeParse(
      withMessageVersion({
        clientMessageId: uuidA,
        recipientUserId: uuidB,
        messages: [
          {
            recipientDeviceId: uuidC,
            ciphertext: "CCCC",
            type: "attachment",
          },
        ],
      })
    );
    expect(parsed.success).toBe(false);
  });

  it("accepts sender-key distribution envelope without attachmentId", () => {
    const parsed = SendMessageRequestSchema.safeParse(
      withMessageVersion({
        clientMessageId: uuidA,
        recipientUserId: uuidB,
        messages: [
          {
            recipientDeviceId: uuidC,
            ciphertext: "DDDD",
            type: "sender_key_distribution",
          },
        ],
      })
    );
    expect(parsed.success).toBe(true);
  });

  it("requires an OTK reservation token for OTK-backed X3DH init messages", () => {
    const parsed = SendMessageRequestSchema.safeParse(
      withMessageVersion({
        clientMessageId: uuidA,
        recipientUserId: uuidB,
        messages: [
          {
            recipientDeviceId: uuidC,
            ciphertext: "EEEE",
            type: "text",
            x3dhHeader: {
              ephemeralKey: "ephemeral",
              signedPreKeyId: 7,
              oneTimePreKeyId: 3,
              senderIdentityKey: "sender",
            },
          },
        ],
      })
    );

    expect(parsed.success).toBe(false);
  });

  it("accepts an OTK reservation token for OTK-backed X3DH init messages", () => {
    const parsed = SendMessageRequestSchema.safeParse(
      withMessageVersion({
        clientMessageId: uuidA,
        recipientUserId: uuidB,
        messages: [
          {
            recipientDeviceId: uuidC,
            ciphertext: "FFFF",
            type: "text",
            x3dhHeader: {
              ephemeralKey: "ephemeral",
              signedPreKeyId: 7,
              oneTimePreKeyId: 3,
              senderIdentityKey: "sender",
            },
            oneTimePreKeyReservationToken: "a".repeat(64),
          },
        ],
      })
    );

    expect(parsed.success).toBe(true);
  });

  it("rejects oversized envelope ciphertext", () => {
    const parsed = SendMessageRequestSchema.safeParse(
      withMessageVersion({
        clientMessageId: uuidA,
        recipientUserId: uuidB,
        messages: [
          {
            recipientDeviceId: uuidC,
            ciphertext: "A".repeat(196_609),
            type: "text",
          },
        ],
      })
    );
    expect(parsed.success).toBe(false);
  });

  it("rejects unsupported top-level message protocol versions", () => {
    const parsed = SendMessageRequestSchema.safeParse({
      version: MESSAGE_PROTOCOL_VERSION + 1,
      clientMessageId: uuidA,
      recipientUserId: uuidB,
      messages: [
        {
          recipientDeviceId: uuidC,
          ciphertext: "AAAA",
          type: "text",
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects unexpected extra fields on direct-message envelopes", () => {
    const parsed = SendMessageRequestSchema.safeParse(
      withMessageVersion({
        clientMessageId: uuidA,
        recipientUserId: uuidB,
        messages: [
          {
            recipientDeviceId: uuidC,
            ciphertext: "AAAA",
            type: "text",
            legacyField: true,
          },
        ],
      })
    );

    expect(parsed.success).toBe(false);
  });
});

describe("SendGroupMessageRequestSchema", () => {
  it("rejects oversized signatures", () => {
    const parsed = SendGroupMessageRequestSchema.safeParse(
      withMessageVersion({
        clientMessageId: uuidA,
        groupId: uuidB,
        distributionId: uuidC,
        chainId: 0,
        messageId: 1,
        ciphertext: "AAAA",
        signature: "B".repeat(129),
        type: "text",
      })
    );
    expect(parsed.success).toBe(false);
  });
});

describe("SendMessageResponseSchema", () => {
  it("accepts per-device delivery details", () => {
    const parsed = SendMessageResponseSchema.safeParse(
      withMessageVersion({
        messageId: uuidA,
        timestamp: new Date().toISOString(),
        deliveries: [
          {
            recipientDeviceId: uuidB,
            messageId: uuidA,
            status: "created",
          },
          {
            recipientDeviceId: uuidC,
            messageId: uuidC,
            status: "duplicate",
          },
        ],
      })
    );

    expect(parsed.success).toBe(true);
  });

  it("rejects response deliveries without per-device status", () => {
    const parsed = SendMessageResponseSchema.safeParse(
      withMessageVersion({
        messageId: uuidA,
        timestamp: new Date().toISOString(),
        deliveries: [
          {
            recipientDeviceId: uuidB,
            messageId: uuidA,
          },
        ],
      })
    );

    expect(parsed.success).toBe(false);
  });
});

describe("PlaintextSenderKeyDistributionMessageSchema", () => {
  it("accepts a valid distribution payload", () => {
    const parsed = PlaintextSenderKeyDistributionMessageSchema.safeParse({
      schemaVersion: 1,
      type: "sender_key_distribution",
      groupId: uuidA,
      senderDeviceId: uuidB,
      distributionId: uuidC,
      chainId: 0,
      chainKey: "AAAA",
      signingKey: "BBBB",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid schemaVersion", () => {
    const parsed = PlaintextSenderKeyDistributionMessageSchema.safeParse({
      schemaVersion: 2,
      type: "sender_key_distribution",
      groupId: uuidA,
      senderDeviceId: uuidB,
      distributionId: uuidC,
      chainId: 0,
      chainKey: "AAAA",
      signingKey: "BBBB",
    });
    expect(parsed.success).toBe(false);
  });
});

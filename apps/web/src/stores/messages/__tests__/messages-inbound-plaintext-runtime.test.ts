import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMessagesInboundPlaintextRuntime } from "@/stores/messages/messages-inbound-plaintext-runtime";

const { importSenderKeyDistributionMock, notifySenderKeyDistributionImportedMock } =
  vi.hoisted(() => ({
    importSenderKeyDistributionMock: vi.fn(),
    notifySenderKeyDistributionImportedMock: vi.fn(),
  }));

vi.mock("@/lib/group-sender-key", () => ({
  importSenderKeyDistribution: importSenderKeyDistributionMock,
}));

vi.mock("@/lib/group-sender-key-events", () => ({
  notifySenderKeyDistributionImported: notifySenderKeyDistributionImportedMock,
}));

function createMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    type: "text",
    senderDeviceId: "22222222-2222-4222-8222-222222222222",
    ...overrides,
  } as never;
}

describe("messages-inbound-plaintext-runtime", () => {
  beforeEach(() => {
    importSenderKeyDistributionMock.mockReset();
    notifySenderKeyDistributionImportedMock.mockReset();
  });

  it("quarantines malformed plaintext JSON", async () => {
    const runtime = createMessagesInboundPlaintextRuntime();
    const handleInboundFailure = vi.fn(async () => {});

    const result = await runtime.parsePlaintextBody(
      createMessage(),
      new TextEncoder().encode("{invalid"),
      handleInboundFailure
    );

    expect(result).toBeNull();
    expect(handleInboundFailure).toHaveBeenCalledWith(
      {
        disposition: "quarantine",
        failureClass: "permanent_malformed_or_corrupt_payload",
        errorKind: "corrupted_payload",
      },
      expect.any(SyntaxError)
    );
  });

  it("imports sender-key distribution, notifies, and commits terminal ack", async () => {
    const runtime = createMessagesInboundPlaintextRuntime();
    const handleInboundFailure = vi.fn(async () => {});
    const commitTerminalAndFlushAck = vi.fn(async () => {});
    const schedulePendingMessageSync = vi.fn();

    const rawBody = {
      schemaVersion: 1,
      type: "sender_key_distribution",
      groupId: "33333333-3333-4333-8333-333333333333",
      senderDeviceId: "22222222-2222-4222-8222-222222222222",
      distributionId: "44444444-4444-4444-8444-444444444444",
      chainId: 1,
      chainKey: "chain-key",
      signingKey: "signing-key",
    };

    const handled = await runtime.handleSenderKeyDistributionMessage({
      message: createMessage({
        type: "sender_key_distribution",
      }),
      rawBody,
      shared: {
        getStorageKey: () => ({}) as CryptoKey,
      } as never,
      schedulePendingMessageSync,
      handleInboundFailure,
      commitTerminalAndFlushAck,
    });

    expect(handled).toBe(true);
    expect(importSenderKeyDistributionMock).toHaveBeenCalledTimes(1);
    expect(notifySenderKeyDistributionImportedMock).toHaveBeenCalledWith({
      groupId: rawBody.groupId,
      senderDeviceId: rawBody.senderDeviceId,
      distributionId: rawBody.distributionId,
    });
    expect(commitTerminalAndFlushAck).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111"
    );
    expect(schedulePendingMessageSync).toHaveBeenCalledWith(
      "sender_key_distribution"
    );
    expect(handleInboundFailure).not.toHaveBeenCalled();
  });

  it("parses attachment captions into attachment placeholder content", async () => {
    const runtime = createMessagesInboundPlaintextRuntime();
    const handleInboundFailure = vi.fn(async () => {});

    const parsed = await runtime.parseIncomingMessageBody(
      createMessage({ type: "attachment" }),
      {
        kind: "file",
        key: "key-material",
        digest: "digest-material",
        attachmentId: "55555555-5555-4555-8555-555555555555",
        fileName: "report.pdf",
        mimeType: "application/pdf",
        size: 123,
        caption: "  hello  ",
      },
      handleInboundFailure
    );

    expect(parsed).toMatchObject({
      messageType: "attachment",
      content: "  hello  ",
      attachment: expect.objectContaining({
        attachmentId: "55555555-5555-4555-8555-555555555555",
      }),
    });
    expect(handleInboundFailure).not.toHaveBeenCalled();
  });
});

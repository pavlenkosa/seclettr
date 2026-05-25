import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMessagesInboundDecryptRuntime } from "@/stores/messages/messages-inbound-decrypt-runtime";
import type { MessagesRuntimeShared } from "@/stores/messages/messages-runtime-shared";

const { decodeDirectEnvelopeMock, ratchetDecryptMock } = vi.hoisted(() => ({
  decodeDirectEnvelopeMock: vi.fn(),
  ratchetDecryptMock: vi.fn(),
}));

vi.mock("@/lib/direct-envelope", () => ({
  decodeDirectEnvelope: decodeDirectEnvelopeMock,
}));

vi.mock("@seclettr/crypto", () => ({
  ratchetDecrypt: ratchetDecryptMock,
}));

function createIncomingMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg-1",
    senderUserId: "user-peer",
    senderDeviceId: "device-peer",
    recipientDeviceId: "device-self",
    type: "text",
    ciphertext: "ciphertext",
    createdAt: new Date().toISOString(),
    ...overrides,
  } as never;
}

describe("messages-inbound-decrypt-runtime", () => {
  beforeEach(() => {
    decodeDirectEnvelopeMock.mockReset();
    ratchetDecryptMock.mockReset();
  });

  it("falls back to legacy AD only on OperationError and saves the session", async () => {
    const session = { id: "session" };
    const loadSession = vi.fn(async () => session);
    const saveSession = vi.fn(async () => {});
    const handleInboundFailure = vi.fn(async () => {});

    decodeDirectEnvelopeMock.mockReturnValue({
      header: { dh: new Uint8Array(32).fill(1), pn: 0, n: 0 },
      ciphertext: new Uint8Array([1, 2, 3]),
    });
    ratchetDecryptMock
      .mockRejectedValueOnce(new DOMException("legacy fallback", "OperationError"))
      .mockResolvedValueOnce(new Uint8Array([7, 8, 9]));

    const runtime = createMessagesInboundDecryptRuntime({
      shared: {
        messageSessionRuntime: {
          loadSession,
          saveSession,
          bootstrapInboundSession: vi.fn(),
        },
      } as unknown as MessagesRuntimeShared,
    });

    const plaintext = await runtime.decryptIncomingPlaintext({
      message: createIncomingMessage(),
      myUserId: "user-self",
      myDeviceId: "device-self",
      handleInboundFailure,
    });

    expect(plaintext).toEqual(new Uint8Array([7, 8, 9]));
    expect(ratchetDecryptMock).toHaveBeenCalledTimes(2);
    expect(saveSession).toHaveBeenCalledWith("device-peer", session);
    expect(handleInboundFailure).not.toHaveBeenCalled();
  });

  it("bootstraps inbound session with AD fallback and commits instead of saveSession", async () => {
    const commit = vi.fn(async () => {});
    const bootstrapInboundSession = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("legacy bootstrap", "OperationError"))
      .mockResolvedValueOnce({
        session: { id: "bootstrapped" },
        plaintext: new Uint8Array([4, 5, 6]),
        commit,
      });
    const saveSession = vi.fn(async () => {});
    const handleInboundFailure = vi.fn(async () => {});

    decodeDirectEnvelopeMock.mockReturnValue({
      header: { dh: new Uint8Array(32).fill(2), pn: 1, n: 3 },
      ciphertext: new Uint8Array([9, 9, 9]),
    });

    const runtime = createMessagesInboundDecryptRuntime({
      shared: {
        messageSessionRuntime: {
          loadSession: vi.fn(async () => null),
          saveSession,
          bootstrapInboundSession,
        },
      } as unknown as MessagesRuntimeShared,
    });

    const plaintext = await runtime.decryptIncomingPlaintext({
      message: createIncomingMessage({
        x3dhHeader: {
          senderIdentityKey: "identity",
          ephemeralKey: "ephemeral",
          signedPreKeyId: 7,
        },
      }),
      myUserId: "user-self",
      myDeviceId: "device-self",
      handleInboundFailure,
    });

    expect(plaintext).toEqual(new Uint8Array([4, 5, 6]));
    expect(bootstrapInboundSession).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(saveSession).not.toHaveBeenCalled();
    expect(handleInboundFailure).not.toHaveBeenCalled();
  });
});

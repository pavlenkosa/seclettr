import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMessagesInboundProcessingRuntime } from "@/stores/messages/messages-inbound-processing-runtime";
import type { MessagesState } from "@/stores/messages/messages-store-runtime-types";

function createBaseState(): MessagesState {
  return {
    conversations: {},
    activeConversationId: null,
    pendingSessions: new Set(),
    processedMessageIds: new Set(),
    pendingAckMessageIds: new Set(),
    quarantinedMessageIds: new Set(),
    pendingReadReceiptMessageIds: new Set(),
    presenceByUser: {},
    typingByUser: {},
    wsConnected: false,
    historyLoaded: false,
    setActiveConversation: vi.fn(),
    fetchUserPresence: vi.fn(),
    sendTypingSignal: vi.fn(),
    markConversationRead: vi.fn(),
    sendMessage: vi.fn(),
    retryDirectMessage: vi.fn(),
    sendAttachment: vi.fn(),
    sendVoiceNote: vi.fn(),
    sendVideoNote: vi.fn(),
    acceptPeerIdentityChange: vi.fn(),
    recordCallEvent: vi.fn(),
    ensureConversationUsername: vi.fn(async () => "user-peer"),
    sendSenderKeyDistribution: vi.fn(),
    upsertConversation: vi.fn(),
    ensureConversation: vi.fn(),
    loadHistory: vi.fn(),
    handleIncomingMessage: vi.fn(),
    startListening: vi.fn(),
    reset: vi.fn(),
  };
}

describe("messages-inbound-processing-runtime", () => {
  let state: MessagesState;

  beforeEach(() => {
    state = createBaseState();
  });

  it("flushes pending ack and exits early for already processed messages", async () => {
    state.processedMessageIds.add("msg-1");
    const warmPeerTrustStore = vi.fn(async () => {});
    const flushPendingAckForMessage = vi.fn(async () => {});

    const runtime = createMessagesInboundProcessingRuntime({
      get: () => state,
      shared: {
        warmPeerTrustStore,
      } as never,
    });

    await runtime.processLockedIncomingMessage({
      message: {
        id: "msg-1",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
      } as never,
      myUserId: "user-self",
      myDeviceId: "device-self",
      schedulePendingMessageSync: vi.fn(),
      inboundDecryptRuntime: {
        decryptIncomingPlaintext: vi.fn(),
      } as never,
      inboundConversationRuntime: {
        persistParsedIncomingMessage: vi.fn(),
      } as never,
      inboundPeerIdentityRuntime: {
        shouldBlockForPeerIdentity: vi.fn(),
      } as never,
      inboundPlaintextRuntime: {
        parsePlaintextBody: vi.fn(),
        handleSenderKeyDistributionMessage: vi.fn(),
        parseIncomingMessageBody: vi.fn(),
      } as never,
      handleInboundFailure: vi.fn(async () => {}),
      classifyUnexpectedInboundFailure: vi.fn(() => ({
        disposition: "retry",
        failureClass: "transient_local_crypto_state",
        errorKind: "decrypt_failed",
      })),
      flushPendingAckForMessage,
      commitTerminalAndFlushAck: vi.fn(async () => {}),
    });

    expect(warmPeerTrustStore).toHaveBeenCalledTimes(1);
    expect(flushPendingAckForMessage).toHaveBeenCalledWith("msg-1");
  });

  it("short-circuits after sender-key distribution handling", async () => {
    const warmPeerTrustStore = vi.fn(async () => {});
    const shouldBlockForPeerIdentity = vi.fn(async () => false);
    const decryptIncomingPlaintext = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const parsePlaintextBody = vi.fn(async () => ({ some: "body" }));
    const handleSenderKeyDistributionMessage = vi.fn(async () => true);
    const persistParsedIncomingMessage = vi.fn(async () => {});

    const runtime = createMessagesInboundProcessingRuntime({
      get: () => state,
      shared: {
        warmPeerTrustStore,
      } as never,
    });

    await runtime.processLockedIncomingMessage({
      message: {
        id: "msg-2",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
      } as never,
      myUserId: "user-self",
      myDeviceId: "device-self",
      schedulePendingMessageSync: vi.fn(),
      inboundDecryptRuntime: {
        decryptIncomingPlaintext,
      } as never,
      inboundConversationRuntime: {
        persistParsedIncomingMessage,
      } as never,
      inboundPeerIdentityRuntime: {
        shouldBlockForPeerIdentity,
      } as never,
      inboundPlaintextRuntime: {
        parsePlaintextBody,
        handleSenderKeyDistributionMessage,
        parseIncomingMessageBody: vi.fn(),
      } as never,
      handleInboundFailure: vi.fn(async () => {}),
      classifyUnexpectedInboundFailure: vi.fn(() => ({
        disposition: "retry",
        failureClass: "transient_local_crypto_state",
        errorKind: "decrypt_failed",
      })),
      flushPendingAckForMessage: vi.fn(async () => {}),
      commitTerminalAndFlushAck: vi.fn(async () => {}),
    });

    expect(shouldBlockForPeerIdentity).toHaveBeenCalledTimes(1);
    expect(decryptIncomingPlaintext).toHaveBeenCalledTimes(1);
    expect(parsePlaintextBody).toHaveBeenCalledTimes(1);
    expect(handleSenderKeyDistributionMessage).toHaveBeenCalledTimes(1);
    expect(persistParsedIncomingMessage).not.toHaveBeenCalled();
  });
});

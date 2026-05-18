import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMessagesInboundPeerIdentityRuntime } from "@/stores/messages/messages-inbound-peer-identity-runtime";
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

describe("messages-inbound-peer-identity-runtime", () => {
  let state: MessagesState;

  beforeEach(() => {
    state = createBaseState();
  });

  it("blocks when a pending identity alert already exists", async () => {
    const getConversationIdentityAlert = vi.fn(() => ({
      deviceId: "device-peer",
      previousIdentityKey: "old-key",
      currentIdentityKey: "new-key",
      detectedAt: 1,
    }));
    const getTrackedPeerIdentityKey = vi.fn(() => null);
    const checkPeerIdentityContinuity = vi.fn(() => ({
      nextConversations: null,
      blocked: true,
    }));
    const commitConversationIdentityUpdate = vi.fn(async () => {});
    const handleInboundFailure = vi.fn(async () => {});

    const runtime = createMessagesInboundPeerIdentityRuntime({
      set: () => {},
      get: () => state,
      shared: {
        peerIdentityRuntime: {
          getConversationIdentityAlert,
          getTrackedPeerIdentityKey,
          checkPeerIdentityContinuity,
        },
        commitConversationIdentityUpdate,
      } as never,
    });

    const blocked = await runtime.shouldBlockForPeerIdentity(
      {
        id: "msg-1",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
        x3dhHeader: {
          senderIdentityKey: "new-key",
        },
      } as never,
      handleInboundFailure
    );

    expect(blocked).toBe(true);
    expect(checkPeerIdentityContinuity).toHaveBeenCalledWith({
      conversations: {},
      recipientUserId: "user-peer",
      deviceId: "device-peer",
      observedIdentityKey: "new-key",
    });
    expect(commitConversationIdentityUpdate).toHaveBeenCalledWith(
      expect.any(Function),
      null
    );
    expect(handleInboundFailure).toHaveBeenCalledWith(
      {
        disposition: "retry",
        failureClass: "trust_or_policy_failure",
        errorKind: "trust_failure",
      },
      expect.any(Error)
    );
  });

  it("blocks on tracked identity mismatch and persists the alerted conversations", async () => {
    state = {
      ...state,
      conversations: {
        "user-peer": {
          userId: "user-peer",
          username: "Peer",
          messages: [],
          lastMessageAt: 0,
          unreadCount: 0,
        },
      },
    };
    const nextConversations = {
      "user-peer": {
        ...state.conversations["user-peer"],
        peerIdentityAlertsByDevice: {
          "device-peer": {
            deviceId: "device-peer",
            previousIdentityKey: "old-key",
            currentIdentityKey: "new-key",
            detectedAt: 1,
          },
        },
      },
    };
    const getConversationIdentityAlert = vi.fn(() => null);
    const getTrackedPeerIdentityKey = vi.fn(() => "old-key");
    const checkPeerIdentityContinuity = vi.fn(() => ({
      nextConversations,
      blocked: true,
    }));
    const commitConversationIdentityUpdate = vi.fn(async () => {});
    const handleInboundFailure = vi.fn(async () => {});

    const runtime = createMessagesInboundPeerIdentityRuntime({
      set: () => {},
      get: () => state,
      shared: {
        peerIdentityRuntime: {
          getConversationIdentityAlert,
          getTrackedPeerIdentityKey,
          checkPeerIdentityContinuity,
        },
        commitConversationIdentityUpdate,
      } as never,
    });

    const blocked = await runtime.shouldBlockForPeerIdentity(
      {
        id: "msg-2",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
        x3dhHeader: {
          senderIdentityKey: "new-key",
        },
      } as never,
      handleInboundFailure
    );

    expect(blocked).toBe(true);
    expect(checkPeerIdentityContinuity).toHaveBeenCalledTimes(2);
    expect(commitConversationIdentityUpdate).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      nextConversations
    );
    expect(commitConversationIdentityUpdate).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      nextConversations
    );
    expect(handleInboundFailure).toHaveBeenCalledWith(
      {
        disposition: "retry",
        failureClass: "trust_or_policy_failure",
        errorKind: "trust_failure",
      },
      expect.any(Error)
    );
  });
});

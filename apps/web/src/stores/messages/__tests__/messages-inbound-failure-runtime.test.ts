import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMessagesInboundFailureRuntime } from "@/stores/messages/messages-inbound-failure-runtime";
import type { MessagesRuntimeShared } from "@/stores/messages/messages-runtime-shared";
import type {
  Conversation,
  Message,
  MessagesState,
} from "@/stores/messages/messages-store-runtime-types";

const { persistConversationsMock } = vi.hoisted(() => ({
  persistConversationsMock: vi.fn(),
}));

vi.mock("@/stores/messages/conversation-persistence", () => ({
  persistConversations: persistConversationsMock,
}));

function createState(overrides: Partial<MessagesState> = {}): MessagesState {
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
    setActiveConversation: () => {},
    fetchUserPresence: async () => {},
    sendTypingSignal: () => {},
    markConversationRead: async () => {},
    sendMessage: async () => {},
    retryDirectMessage: async () => {},
    sendAttachment: async () => {},
    sendVoiceNote: async () => {},
    sendVideoNote: async () => {},
    acceptPeerIdentityChange: async () => {},
    recordCallEvent: () => {},
    ensureConversationUsername: async () => null,
    sendSenderKeyDistribution: async () => [],
    upsertConversation: () => {},
    ensureConversation: () => {},
    loadHistory: async () => {},
    handleIncomingMessage: async () => {},
    startListening: () => () => {},
    reset: () => {},
    ...overrides,
  };
}

function getOrCreateConversation(
  conversations: Record<string, Conversation>,
  userId: string
): Conversation {
  return (
    conversations[userId] ?? {
      userId,
      username: userId,
      messages: [],
      lastMessageAt: 0,
      unreadCount: 0,
    }
  );
}

function replaceOrAppendMessage(
  messages: Message[],
  messageId: string,
  nextMessage: Message
) {
  const existingMessageIndex = messages.findIndex((entry) => entry.id === messageId);
  if (existingMessageIndex < 0) {
    return {
      messages: [...messages, nextMessage],
      existingMessageIndex,
    };
  }

  return {
    messages: messages.map((entry, index) =>
      index === existingMessageIndex
        ? { ...entry, ...nextMessage, isOwn: false }
        : entry
    ),
    existingMessageIndex,
  };
}

describe("messages-inbound-failure-runtime", () => {
  beforeEach(() => {
    persistConversationsMock.mockReset();
  });

  it("classifies OperationError as retryable local crypto desync with clearSession", () => {
    const runtime = createMessagesInboundFailureRuntime({
      set: () => {},
      get: () => createState(),
      shared: {} as MessagesRuntimeShared,
      getOrCreateConversation,
      replaceOrAppendMessage,
    });

    const decision = runtime.classifyUnexpectedInboundFailure(
      {
        id: "msg-1",
        type: "text",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
        recipientDeviceId: "device-self",
        createdAt: new Date().toISOString(),
        ciphertext: "cipher",
      } as never,
      new DOMException("decrypt failed", "OperationError")
    );

    expect(decision).toEqual({
      disposition: "retry",
      failureClass: "transient_local_crypto_state",
      errorKind: "decrypt_failed",
      clearSession: true,
    });
  });

  it("persists a retryable decrypt placeholder for visible messages", async () => {
    let state = createState();
    const setState = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    const clearSession = vi.fn(async () => {});
    const runtime = createMessagesInboundFailureRuntime({
      set: setState,
      get: () => state,
      shared: {
        messageSessionRuntime: { clearSession },
        inboundTrackingCoordinator: {
          flushPendingAckForMessage: vi.fn(async () => {}),
          commitTerminalMessageState: vi.fn(async () => {}),
        },
      } as unknown as MessagesRuntimeShared,
      getOrCreateConversation,
      replaceOrAppendMessage,
    });

    await runtime.handleInboundFailure(
      {
        id: "msg-1",
        type: "text",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
        recipientDeviceId: "device-self",
        createdAt: new Date().toISOString(),
        ciphertext: "cipher",
      } as never,
      {
        disposition: "retry",
        failureClass: "transient_local_crypto_state",
        errorKind: "decrypt_failed",
        clearSession: true,
      },
      new Error("boom")
    );

    expect(state.conversations["user-peer"]?.messages[0]?.status).toBe("error");
    expect(state.conversations["user-peer"]?.messages[0]?.errorKind).toBe(
      "decrypt_failed"
    );
    expect(persistConversationsMock).toHaveBeenCalledTimes(1);
    expect(clearSession).toHaveBeenCalledWith("device-peer");
  });

  it("quarantines sender-key failures without creating a visible bubble", async () => {
    let state = createState();
    const setState = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    const flushPendingAckForMessage = vi.fn(async () => {});
    const commitTerminalMessageState = vi.fn(async () => {});
    const runtime = createMessagesInboundFailureRuntime({
      set: setState,
      get: () => state,
      shared: {
        messageSessionRuntime: { clearSession: vi.fn(async () => {}) },
        inboundTrackingCoordinator: {
          flushPendingAckForMessage,
          commitTerminalMessageState,
        },
      } as unknown as MessagesRuntimeShared,
      getOrCreateConversation,
      replaceOrAppendMessage,
    });

    await runtime.handleInboundFailure(
      {
        id: "msg-sender-key",
        type: "sender_key_distribution",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
        recipientDeviceId: "device-self",
        createdAt: new Date().toISOString(),
        ciphertext: "cipher",
      } as never,
      {
        disposition: "quarantine",
        failureClass: "trust_or_policy_failure",
        errorKind: "trust_failure",
      },
      new Error("blocked")
    );

    expect(state.conversations["user-peer"]).toBeUndefined();
    expect(persistConversationsMock).not.toHaveBeenCalled();
    expect(commitTerminalMessageState).toHaveBeenCalledWith(
      setState,
      expect.any(Function),
      "msg-sender-key",
      { quarantined: true }
    );
    expect(flushPendingAckForMessage).toHaveBeenCalledWith(
      setState,
      expect.any(Function),
      "msg-sender-key"
    );
  });
});

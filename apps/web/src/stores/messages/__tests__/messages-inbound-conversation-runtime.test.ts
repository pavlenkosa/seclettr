import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMessagesInboundConversationRuntime,
} from "@/stores/messages/messages-inbound-conversation-runtime";
import type { MessagesState } from "@/stores/messages/messages-store-runtime-types";

const { persistConversationsMock, primeUserLabelCacheMock, shouldHydrateUserLabelMock } =
  vi.hoisted(() => ({
    persistConversationsMock: vi.fn(),
    primeUserLabelCacheMock: vi.fn(),
    shouldHydrateUserLabelMock: vi.fn(() => false),
  }));

vi.mock("@/stores/messages/conversation-persistence", () => ({
  persistConversations: persistConversationsMock,
}));

vi.mock("@/lib/user-labels", () => ({
  getCachedUserLabel: vi.fn(() => null),
  primeUserLabelCache: primeUserLabelCacheMock,
  shouldHydrateUserLabel: shouldHydrateUserLabelMock,
}));

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

describe("messages-inbound-conversation-runtime", () => {
  beforeEach(() => {
    persistConversationsMock.mockReset();
    persistConversationsMock.mockResolvedValue(undefined);
    primeUserLabelCacheMock.mockReset();
    shouldHydrateUserLabelMock.mockReset();
    shouldHydrateUserLabelMock.mockReturnValue(false);
  });

  it("persists a delivered inbound message, caches peer identity, and increments unread when inactive", async () => {
    let state = createBaseState();
    const cachePeerIdentity = vi.fn();
    const trySendReadReceipt = vi.fn(() => true);
    const queueReadReceipt = vi.fn(async () => {});
    const commitTerminalAndFlushAck = vi.fn(async () => {});

    const set = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
    ) => {
      const next = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...next };
    };

    const runtime = createMessagesInboundConversationRuntime({
      set,
      get: () => state,
      shared: {
        peerIdentityRuntime: { cachePeerIdentity },
      } as never,
      trySendReadReceipt,
      queueReadReceipt,
    });

    await runtime.persistParsedIncomingMessage({
      message: {
        id: "msg-1",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
        createdAt: "2026-05-18T08:00:00.000Z",
        x3dhHeader: {
          senderIdentityKey: "peer-identity-key",
        },
      } as never,
      parsedBody: {
        messageType: "text",
        content: "hello",
      },
      commitTerminalAndFlushAck,
    });

    expect(cachePeerIdentity).toHaveBeenCalledWith(
      "device-peer",
      "peer-identity-key"
    );
    expect(state.conversations["user-peer"]).toMatchObject({
      unreadCount: 1,
      peerIdentityKey: "peer-identity-key",
      peerIdentityDeviceId: "device-peer",
      peerIdentityByDevice: {
        "device-peer": "peer-identity-key",
      },
    });
    expect(state.conversations["user-peer"]?.messages[0]).toMatchObject({
      id: "msg-1",
      content: "hello",
      status: "delivered",
      isOwn: false,
    });
    expect(primeUserLabelCacheMock).toHaveBeenCalledWith("user-peer", "user-peer");
    expect(commitTerminalAndFlushAck).toHaveBeenCalledWith("msg-1");
    expect(trySendReadReceipt).not.toHaveBeenCalled();
    expect(queueReadReceipt).not.toHaveBeenCalled();
    expect(persistConversationsMock).toHaveBeenCalledTimes(1);
  });

  it("marks an active inbound message as read and queues a receipt fallback", async () => {
    let state = createBaseState();
    state = {
      ...state,
      activeConversationId: "user-peer",
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
    const cachePeerIdentity = vi.fn();
    const trySendReadReceipt = vi.fn(() => false);
    const queueReadReceipt = vi.fn(async () => {});
    const commitTerminalAndFlushAck = vi.fn(async () => {});
    shouldHydrateUserLabelMock.mockReturnValue(true);

    const set = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
    ) => {
      const next = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...next };
    };

    const runtime = createMessagesInboundConversationRuntime({
      set,
      get: () => state,
      shared: {
        peerIdentityRuntime: { cachePeerIdentity },
      } as never,
      trySendReadReceipt,
      queueReadReceipt,
    });

    await runtime.persistParsedIncomingMessage({
      message: {
        id: "msg-2",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
        createdAt: "2026-05-18T09:00:00.000Z",
      } as never,
      parsedBody: {
        messageType: "text",
        content: "world",
      },
      commitTerminalAndFlushAck,
    });

    expect(state.conversations["user-peer"]?.unreadCount).toBe(0);
    expect(state.conversations["user-peer"]?.messages[0]).toMatchObject({
      id: "msg-2",
      status: "read",
    });
    expect(queueReadReceipt).toHaveBeenCalledWith("msg-2");
    expect(
      state.ensureConversationUsername as unknown as ReturnType<typeof vi.fn>
    ).toHaveBeenCalledWith("user-peer");
    expect(persistConversationsMock).toHaveBeenCalledTimes(2);
  });
});

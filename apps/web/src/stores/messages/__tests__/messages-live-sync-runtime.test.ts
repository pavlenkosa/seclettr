// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMessagesLiveSyncRuntime } from "@/stores/messages/createMessagesLiveSyncRuntime";
import type { MessagesRuntimeShared } from "@/stores/messages/messages-runtime-shared";
import type { MessagesState } from "@/stores/messages/messages-store-runtime-types";

const {
  persistConversationsMock,
  persistPendingReadReceiptMessageIdsMock,
  replenishOtksIfNeededMock,
  wsSendMock,
  listeners,
} = vi.hoisted(() => ({
  persistConversationsMock: vi.fn(),
  persistPendingReadReceiptMessageIdsMock: vi.fn(),
  replenishOtksIfNeededMock: vi.fn(async () => {}),
  wsSendMock: vi.fn(),
  listeners: {
    connection: null as ((connected: boolean) => void) | null,
    message: null as ((message: unknown) => void) | null,
    connected: false,
  },
}));

vi.mock("@/lib/websocket", () => ({
  wsClient: {
    get connected() {
      return listeners.connected;
    },
    send: wsSendMock,
    onConnectionChange: (listener: (connected: boolean) => void) => {
      listeners.connection = listener;
      return () => {
        listeners.connection = null;
      };
    },
    on: (listener: (message: unknown) => void) => {
      listeners.message = listener;
      return () => {
        listeners.message = null;
      };
    },
  },
}));

vi.mock("@/stores/messages/conversation-persistence", () => ({
  persistConversations: persistConversationsMock,
  persistPendingReadReceiptMessageIds: persistPendingReadReceiptMessageIdsMock,
  trimMessageIds: (ids: Set<string>) => ids,
}));

vi.mock("@/stores/messages/otk-replenishment", () => ({
  replenishOtksIfNeeded: replenishOtksIfNeededMock,
}));

function createState(overrides: Partial<MessagesState> = {}): MessagesState {
  return {
    conversations: {},
    activeConversationId: null,
    pendingSessions: new Set(),
    processedMessageIds: new Set(),
    pendingAckMessageIds: new Set(),
    quarantinedMessageIds: new Set(),
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
    pendingReadReceiptMessageIds:
      overrides.pendingReadReceiptMessageIds ?? new Set(),
  };
}

describe("createMessagesLiveSyncRuntime", () => {
  beforeEach(() => {
    persistConversationsMock.mockReset();
    persistPendingReadReceiptMessageIdsMock.mockReset();
    replenishOtksIfNeededMock.mockReset().mockResolvedValue(undefined);
    wsSendMock.mockReset().mockReturnValue({ status: "sent" });
    listeners.connection = null;
    listeners.message = null;
    listeners.connected = false;
  });

  it("flushes pending acknowledgements and syncs pending messages on reconnect", async () => {
    let state = createState({
      activeConversationId: "user-peer",
      historyLoaded: true,
    });
    const setState = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };
    const flushPendingAcknowledgements = vi.fn(async () => {});
    const syncPendingMessages = vi.fn(async () => {});
    const markConversationRead = vi.fn(async () => {});
    state = {
      ...state,
      markConversationRead,
    };

    const shared = {
      runtimeState: {
        historyBootstrapPromise: null,
        historyBootstrapInFlightKey: null,
        historyBootstrapCompletedKey: null,
        pendingSyncPromise: null,
        scheduledPendingSyncTimer: null,
        typingTimeoutByUser: new Map(),
        sentReadReceipts: new Set(),
        sessionLocks: new Map(),
        ownMessageIndex: new Map(),
        pendingConversationPersistTimer: null,
      },
      inboundTrackingCoordinator: {
        flushPendingAcknowledgements,
      },
    } as unknown as MessagesRuntimeShared;

    const runtime = createMessagesLiveSyncRuntime({
      set: setState,
      get: () => state,
      shared,
      syncPendingMessages,
    });

    const stopListening = runtime.startListening();
    listeners.connected = true;
    listeners.connection?.(true);
    await Promise.resolve();

    expect(markConversationRead).toHaveBeenCalledWith("user-peer");
    expect(flushPendingAcknowledgements).toHaveBeenCalledTimes(1);
    expect(syncPendingMessages).toHaveBeenCalledTimes(1);
    expect(state.wsConnected).toBe(true);

    stopListening();
  });

  it("bootstraps history on reconnect before the first pending sync", async () => {
    const loadHistory = vi.fn(async () => {});
    let state = createState({
      historyLoaded: false,
      loadHistory,
    });
    const setState = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };
    const syncPendingMessages = vi.fn(async () => {});

    const shared = {
      runtimeState: {
        historyBootstrapPromise: null,
        historyBootstrapInFlightKey: null,
        historyBootstrapCompletedKey: null,
        pendingSyncPromise: null,
        scheduledPendingSyncTimer: null,
        typingTimeoutByUser: new Map(),
        sentReadReceipts: new Set(),
        sessionLocks: new Map(),
        ownMessageIndex: new Map(),
        pendingConversationPersistTimer: null,
      },
      inboundTrackingCoordinator: {
        flushPendingAcknowledgements: vi.fn(async () => {}),
      },
    } as unknown as MessagesRuntimeShared;

    const runtime = createMessagesLiveSyncRuntime({
      set: setState,
      get: () => state,
      shared,
      syncPendingMessages,
    });

    const stopListening = runtime.startListening();
    listeners.connected = true;
    listeners.connection?.(true);
    await Promise.resolve();

    expect(loadHistory).toHaveBeenCalledTimes(1);
    expect(syncPendingMessages).toHaveBeenCalledTimes(0);

    stopListening();
  });

  it("updates own-message delivery and read statuses from websocket events", async () => {
    let state = createState({
      conversations: {
        "user-peer": {
          userId: "user-peer",
          username: "Alice",
          messages: [
            {
              id: "client-1",
              senderId: "self",
              senderDeviceId: "device-self",
              content: "hello",
              type: "text",
              timestamp: 1,
              status: "sent",
              isOwn: true,
            },
          ],
          lastMessageAt: 1,
          unreadCount: 0,
        },
      },
    });
    const setState = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    vi.useFakeTimers();

    const shared = {
      runtimeState: {
        historyBootstrapPromise: null,
        historyBootstrapInFlightKey: null,
        historyBootstrapCompletedKey: null,
        pendingSyncPromise: null,
        scheduledPendingSyncTimer: null,
        typingTimeoutByUser: new Map(),
        sentReadReceipts: new Set(),
        sessionLocks: new Map(),
        ownMessageIndex: new Map(),
        pendingConversationPersistTimer: null,
      },
      inboundTrackingCoordinator: {
        flushPendingAcknowledgements: vi.fn(async () => {}),
      },
    } as unknown as MessagesRuntimeShared;

    const runtime = createMessagesLiveSyncRuntime({
      set: setState,
      get: () => state,
      shared,
      syncPendingMessages: vi.fn(async () => {}),
    });

    const stopListening = runtime.startListening();

    listeners.message?.({
      type: "message.delivered",
      messageId: "server-1",
      clientMessageId: "client-1",
    });
    expect(
      state.conversations["user-peer"]?.messages[0]?.status
    ).toBe("delivered");

    listeners.message?.({
      type: "message.read",
      messageId: "server-1",
      clientMessageId: "client-1",
    });
    expect(state.conversations["user-peer"]?.messages[0]?.status).toBe("read");

    // Two rapid status updates are coalesced into a single debounced persist.
    expect(persistConversationsMock).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(500);
    expect(persistConversationsMock).toHaveBeenCalledTimes(1);

    stopListening();
    vi.useRealTimers();
  });

  it("queues read receipts while offline and flushes them on reconnect", async () => {
    let state = createState({
      pendingReadReceiptMessageIds: new Set(["msg-offline"]),
    });
    const setState = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    const shared = {
      runtimeState: {
        historyBootstrapPromise: null,
        historyBootstrapInFlightKey: null,
        historyBootstrapCompletedKey: null,
        pendingSyncPromise: null,
        scheduledPendingSyncTimer: null,
        typingTimeoutByUser: new Map(),
        sentReadReceipts: new Set(),
        sessionLocks: new Map(),
        ownMessageIndex: new Map(),
        pendingConversationPersistTimer: null,
      },
      inboundTrackingCoordinator: {
        flushPendingAcknowledgements: vi.fn(async () => {}),
      },
    } as unknown as MessagesRuntimeShared;

    const runtime = createMessagesLiveSyncRuntime({
      set: setState,
      get: () => state,
      shared,
      syncPendingMessages: vi.fn(async () => {}),
    });

    const stopListening = runtime.startListening();
    listeners.connected = true;
    listeners.connection?.(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(wsSendMock).toHaveBeenCalledWith({
      type: "message.read",
      messageId: "msg-offline",
    });
    expect(state.pendingReadReceiptMessageIds.size).toBe(0);

    stopListening();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMessagesHistoryRuntime } from "@/stores/messages/createMessagesHistoryRuntime";
import type { MessagesRuntimeShared } from "@/stores/messages/messages-runtime-shared";
import type { MessagesState } from "@/stores/messages/messages-store-runtime-types";

const {
  apiGetMock,
  restoreConversationsMock,
  restoreProcessedMessageIdsMock,
  restorePendingAckMessageIdsMock,
  restorePendingReadReceiptMessageIdsMock,
  restoreQuarantinedMessageIdsMock,
  trimMessageIdsMock,
  primeUserLabelCacheMock,
  shouldHydrateUserLabelMock,
} = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  restoreConversationsMock: vi.fn(),
  restoreProcessedMessageIdsMock: vi.fn(),
  restorePendingAckMessageIdsMock: vi.fn(),
  restorePendingReadReceiptMessageIdsMock: vi.fn(),
  restoreQuarantinedMessageIdsMock: vi.fn(),
  trimMessageIdsMock: vi.fn((ids: Set<string>) => ids),
  primeUserLabelCacheMock: vi.fn(),
  shouldHydrateUserLabelMock: vi.fn(() => false),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: apiGetMock,
  },
}));

vi.mock("@/lib/user-labels", () => ({
  primeUserLabelCache: primeUserLabelCacheMock,
  shouldHydrateUserLabel: shouldHydrateUserLabelMock,
}));

vi.mock("@/stores/messages/conversation-persistence", () => ({
  persistConversations: vi.fn(),
  restoreConversations: restoreConversationsMock,
  restoreProcessedMessageIds: restoreProcessedMessageIdsMock,
  restorePendingAckMessageIds: restorePendingAckMessageIdsMock,
  restorePendingReadReceiptMessageIds: restorePendingReadReceiptMessageIdsMock,
  restoreQuarantinedMessageIds: restoreQuarantinedMessageIdsMock,
  trimMessageIds: trimMessageIdsMock,
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

describe("createMessagesHistoryRuntime", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    restoreConversationsMock.mockReset().mockResolvedValue(null);
    restoreProcessedMessageIdsMock.mockReset().mockResolvedValue(null);
    restorePendingAckMessageIdsMock.mockReset().mockResolvedValue(null);
    restorePendingReadReceiptMessageIdsMock.mockReset().mockResolvedValue(null);
    restoreQuarantinedMessageIdsMock.mockReset().mockResolvedValue(null);
    trimMessageIdsMock.mockClear();
    primeUserLabelCacheMock.mockReset();
    shouldHydrateUserLabelMock.mockReset().mockReturnValue(false);
  });

  it("deduplicates concurrent history bootstraps for the same device key", async () => {
    let state = createState({
      handleIncomingMessage: async () => {},
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
    const warmPeerTrustStore = vi.fn(async () => {});

    apiGetMock.mockResolvedValue({ version: 1, messages: [] });

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
      },
      inboundTrackingCoordinator: {
        flushPendingAcknowledgements,
      },
      warmPeerTrustStore,
      getHistoryBootstrapKey: () => "user-self:device-self",
      indexOwnMessages: vi.fn(),
    } as unknown as MessagesRuntimeShared;

    const runtime = createMessagesHistoryRuntime({
      set: setState,
      get: () => state,
      shared,
    });

    await Promise.all([runtime.loadHistory(), runtime.loadHistory()]);

    expect(warmPeerTrustStore).toHaveBeenCalledTimes(1);
    expect(apiGetMock).toHaveBeenCalledTimes(1);
    expect(flushPendingAcknowledgements).toHaveBeenCalledTimes(2);
    expect(state.historyLoaded).toBe(true);
  });

  it("restores persisted conversation state and pending ack metadata before sync", async () => {
    let state = createState({
      ensureConversationUsername: async () => "hydrated",
      handleIncomingMessage: async () => {},
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
    const warmPeerTrustStore = vi.fn(async () => {});

    restoreConversationsMock.mockResolvedValue({
      "user-peer": {
        userId: "user-peer",
        username: "Alice",
        messages: [
          {
            id: "msg-1",
            senderId: "user-peer",
            senderDeviceId: "device-peer",
            content: "hello",
            type: "text",
            timestamp: 1,
            status: "delivered",
            isOwn: false,
          },
        ],
        lastMessageAt: 1,
        unreadCount: 1,
      },
    });
    restoreProcessedMessageIdsMock.mockResolvedValue(["persisted-1"]);
    restorePendingAckMessageIdsMock.mockResolvedValue(["pending-1"]);
    restorePendingReadReceiptMessageIdsMock.mockResolvedValue(["read-1"]);
    restoreQuarantinedMessageIdsMock.mockResolvedValue(["quarantine-1"]);
    apiGetMock.mockResolvedValue({ version: 1, messages: [] });

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
      },
      inboundTrackingCoordinator: {
        flushPendingAcknowledgements,
      },
      warmPeerTrustStore,
      getHistoryBootstrapKey: () => "user-self:device-self",
      indexOwnMessages: vi.fn(),
    } as unknown as MessagesRuntimeShared;

    const runtime = createMessagesHistoryRuntime({
      set: setState,
      get: () => state,
      shared,
    });

    await runtime.loadHistory();

    expect(state.conversations["user-peer"]?.messages).toHaveLength(1);
    expect(state.processedMessageIds.has("persisted-1")).toBe(true);
    expect(state.processedMessageIds.has("msg-1")).toBe(true);
    expect(state.pendingAckMessageIds.has("pending-1")).toBe(true);
    expect(state.pendingReadReceiptMessageIds.has("read-1")).toBe(true);
    expect(state.quarantinedMessageIds.has("quarantine-1")).toBe(true);
    expect(primeUserLabelCacheMock).toHaveBeenCalledWith("user-peer", "Alice");
    expect(flushPendingAcknowledgements).toHaveBeenCalledTimes(2);
  });

  it("merges restored conversations with live in-memory state without dropping live messages", async () => {
    let state = createState({
      conversations: {
        "user-peer": {
          userId: "user-peer",
          username: "Alice",
          messages: [
            {
              id: "live-1",
              senderId: "user-peer",
              senderDeviceId: "device-peer",
              content: "live-message",
              type: "text",
              timestamp: 20,
              status: "delivered",
              isOwn: false,
            },
          ],
          lastMessageAt: 20,
          unreadCount: 0,
        },
      },
      ensureConversationUsername: async () => "hydrated",
      handleIncomingMessage: async () => {},
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
    const warmPeerTrustStore = vi.fn(async () => {});

    restoreConversationsMock.mockResolvedValue({
      "user-peer": {
        userId: "user-peer",
        username: "Alice",
        messages: [
          {
            id: "persisted-1",
            senderId: "user-peer",
            senderDeviceId: "device-peer",
            content: "persisted-message",
            type: "text",
            timestamp: 10,
            status: "delivered",
            isOwn: false,
          },
        ],
        lastMessageAt: 10,
        unreadCount: 1,
      },
    });
    apiGetMock.mockResolvedValue({ version: 1, messages: [] });

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
      },
      inboundTrackingCoordinator: {
        flushPendingAcknowledgements,
      },
      warmPeerTrustStore,
      getHistoryBootstrapKey: () => "user-self:device-self",
      indexOwnMessages: vi.fn(),
    } as unknown as MessagesRuntimeShared;

    const runtime = createMessagesHistoryRuntime({
      set: setState,
      get: () => state,
      shared,
    });

    await runtime.loadHistory();

    const messageIds = state.conversations["user-peer"]?.messages.map(
      (message) => message.id
    );
    expect(messageIds).toEqual(["persisted-1", "live-1"]);
    expect(state.conversations["user-peer"]?.unreadCount).toBe(0);
  });
});

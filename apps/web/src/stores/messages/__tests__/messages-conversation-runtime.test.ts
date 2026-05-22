import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMessagesConversationRuntime } from "../createMessagesConversationRuntime";
import type { Conversation, Message } from "../messages-store-runtime-types";

const mockedPersistence = vi.hoisted(() => ({
  persistConversations: vi.fn(async () => {}),
  persistPendingReadReceiptMessageIds: vi.fn(async () => {}),
  trimMessageIds: vi.fn((ids: Set<string>) => ids),
}));

const mockedUserLabels = vi.hoisted(() => ({
  fetchUserLabel: vi.fn(async () => "hydrated-user"),
  primeUserLabelCache: vi.fn(),
  shouldHydrateUserLabel: vi.fn(() => false),
}));

vi.mock("../conversation-persistence", () => ({
  persistConversations: mockedPersistence.persistConversations,
  persistPendingReadReceiptMessageIds: mockedPersistence.persistPendingReadReceiptMessageIds,
  trimMessageIds: mockedPersistence.trimMessageIds,
}));

vi.mock("@/lib/user-labels", () => ({
  fetchUserLabel: mockedUserLabels.fetchUserLabel,
  primeUserLabelCache: mockedUserLabels.primeUserLabelCache,
  shouldHydrateUserLabel: mockedUserLabels.shouldHydrateUserLabel,
}));

type StoreState = {
  conversations: Record<string, Conversation>;
  activeConversationId: string | null;
  pendingReadReceiptMessageIds: Set<string>;
  ensureConversationUsername: (userId: string, preferredUsername?: string) => Promise<string | null>;
};

function createBaseMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "m1",
    senderId: "peer",
    senderDeviceId: "device-1",
    content: "hello",
    type: "text",
    timestamp: 1,
    status: "sent",
    isOwn: false,
    ...overrides,
  };
}

function createConversation(messages: Message[], unreadCount = messages.length): Conversation {
  return {
    userId: "user-peer",
    username: "Peer",
    messages,
    lastMessageAt: messages[messages.length - 1]?.timestamp ?? 0,
    unreadCount,
  };
}

describe("createMessagesConversationRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUserLabels.shouldHydrateUserLabel.mockReturnValue(false);
  });

  it("marks readable peer messages as read and queues unsent receipts", async () => {
    const readCandidate = createBaseMessage({ id: "m-read" });
    const queuedCandidate = createBaseMessage({ id: "m-queued", timestamp: 2 });
    const ownMessage = createBaseMessage({
      id: "m-own",
      senderId: "me",
      isOwn: true,
      status: "read",
      timestamp: 3,
    });

    let state: StoreState = {
      conversations: {
        "user-peer": createConversation(
          [readCandidate, queuedCandidate, ownMessage],
          2
        ),
      },
      activeConversationId: null,
      pendingReadReceiptMessageIds: new Set<string>(["m-read"]),
      ensureConversationUsername: vi.fn(async () => null),
    };

    const set = (partial: Partial<StoreState> | ((value: StoreState) => Partial<StoreState>)) => {
      const nextPartial = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...nextPartial };
    };
    const get = () => state as never;
    const runtime = createMessagesConversationRuntime({
      set: set as never,
      get,
      shared: {
        getMyUserId: () => "me",
        getMyDeviceId: () => "device-self",
      } as never,
      liveSyncRuntime: {
        trySendReadReceipt: (messageId) => messageId === "m-read",
        hasSentReadReceipt: () => false,
      },
    });

    await runtime.markConversationRead("user-peer");

    expect(state.conversations["user-peer"]?.unreadCount).toBe(0);
    expect(state.conversations["user-peer"]?.messages[0]?.status).toBe("read");
    expect(state.conversations["user-peer"]?.messages[1]?.status).toBe("sent");
    expect(Array.from(state.pendingReadReceiptMessageIds)).toEqual(["m-queued"]);
    expect(mockedPersistence.persistConversations).toHaveBeenCalledTimes(1);
    expect(mockedPersistence.persistPendingReadReceiptMessageIds).toHaveBeenCalledTimes(1);
  });

  it("records inbound call events and hydrates missing usernames lazily", () => {
    const ensureConversationUsername = vi.fn(async () => "hydrated-user");
    let state: StoreState = {
      conversations: {},
      activeConversationId: null,
      pendingReadReceiptMessageIds: new Set<string>(),
      ensureConversationUsername,
    };

    const set = (partial: Partial<StoreState> | ((value: StoreState) => Partial<StoreState>)) => {
      const nextPartial = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...nextPartial };
    };
    const get = () => state as never;
    const runtime = createMessagesConversationRuntime({
      set: set as never,
      get,
      shared: {
        getMyUserId: () => "me",
        getMyDeviceId: () => "device-self",
      } as never,
      liveSyncRuntime: {
        trySendReadReceipt: () => false,
        hasSentReadReceipt: () => false,
      },
    });

    runtime.recordCallEvent({
      userId: "user-peer",
      mode: "audio",
      direction: "inbound",
      outcome: "missed",
    });

    expect(state.conversations["user-peer"]?.messages).toHaveLength(1);
    expect(state.conversations["user-peer"]?.messages[0]?.type).toBe("call");
    expect(state.conversations["user-peer"]?.unreadCount).toBe(1);
    expect(mockedPersistence.persistConversations).toHaveBeenCalledTimes(1);
    expect(ensureConversationUsername).toHaveBeenCalledWith("user-peer");
  });
});

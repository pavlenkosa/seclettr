// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiGetMock, apiPostMock, apiPatchMock, apiDeleteMock, wsOnMock, wsOnConnectionMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
  apiPatchMock: vi.fn(),
  apiDeleteMock: vi.fn(),
  wsOnMock: vi.fn(),
  wsOnConnectionMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { get: apiGetMock, post: apiPostMock, patch: apiPatchMock, delete: apiDeleteMock },
}));

vi.mock("@/lib/websocket", () => ({
  wsClient: { on: wsOnMock, onConnectionChange: wsOnConnectionMock, connected: true },
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: { getState: () => ({ userId: "me", username: "Me", deviceId: "dev" }) },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { usePlainMessagesStore } from "../plain-messages-store";

type WsMessage = { type: string; [k: string]: unknown };
let wsHandler: ((message: WsMessage) => void) | null = null;

function makeWire(overrides: Record<string, unknown> = {}) {
  return {
    id: "srv-1",
    clientId: "wire-c1",
    senderUserId: "peer",
    senderUsername: "Peer",
    recipientUserId: "me",
    recipientUsername: "Me",
    content: "incoming",
    messageType: "text",
    createdAt: new Date(1_700_000_000_000).toISOString(),
    ...overrides,
  };
}

function conversations() {
  return usePlainMessagesStore.getState().conversations;
}

describe("plain-messages-store", () => {
  let unsubscribe: () => void;

  beforeEach(() => {
    apiGetMock.mockReset();
    apiPostMock.mockReset();
    apiPatchMock.mockReset();
    apiDeleteMock.mockReset();
    wsHandler = null;
    wsOnMock.mockReset().mockImplementation((cb: (message: WsMessage) => void) => {
      wsHandler = cb;
      return () => {};
    });
    wsOnConnectionMock.mockReset().mockReturnValue(() => {});
    usePlainMessagesStore.getState().reset();
    unsubscribe = usePlainMessagesStore.getState().subscribe();
  });

  afterEach(() => {
    unsubscribe();
    localStorage.clear();
  });

  it("inserts an optimistic message before the API resolves", () => {
    let resolveSend: (value: unknown) => void = () => {};
    apiPostMock.mockReturnValue(new Promise((resolve) => { resolveSend = resolve; }));

    void usePlainMessagesStore.getState().sendText("peer", "Peer", "hello");

    const msg = conversations()["peer"]?.messages.at(-1);
    expect(msg?.content).toBe("hello");
    expect(msg?.status).toBe("sending");
    expect(msg?.isOwn).toBe(true);
    resolveSend({ id: "srv-1", clientId: msg?.clientId, createdAt: "" });
  });

  it("promotes the optimistic message to sent with the server id", async () => {
    apiPostMock.mockResolvedValue({ id: "server-id", clientId: "x", createdAt: "" });

    await usePlainMessagesStore.getState().sendText("peer", "Peer", "hello");

    const msg = conversations()["peer"]?.messages.at(-1);
    expect(msg?.status).toBe("sent");
    expect(msg?.id).toBe("server-id");
  });

  it("marks the optimistic message as error when the API rejects", async () => {
    apiPostMock.mockRejectedValue(new Error("network"));

    await usePlainMessagesStore.getState().sendText("peer", "Peer", "hello");

    expect(conversations()["peer"]?.messages.at(-1)?.status).toBe("error");
  });

  it("reconciles a WS echo of an own message instead of duplicating it", async () => {
    apiPostMock.mockResolvedValue({ id: "server-id", clientId: "x", createdAt: "" });
    await usePlainMessagesStore.getState().sendText("peer", "Peer", "hello");
    const clientId = conversations()["peer"]?.messages.at(-1)?.clientId;

    wsHandler?.({
      type: "plain_message.new",
      message: makeWire({ id: "server-id", clientId, senderUserId: "me", content: "hello" }),
    });

    const messages = conversations()["peer"]?.messages ?? [];
    expect(messages).toHaveLength(1);
    expect(messages[0]?.status).toBe("sent");
  });

  it("appends an incoming peer message and bumps the unread count", () => {
    wsHandler?.({ type: "plain_message.new", message: makeWire() });

    const conv = conversations()["peer"];
    expect(conv?.messages.at(-1)?.content).toBe("incoming");
    expect(conv?.unreadCount).toBe(1);
  });

  it("ignores plain_message.new events that belong to a group thread", () => {
    wsHandler?.({ type: "plain_message.new", message: makeWire({ groupId: "g1" }) });
    expect(conversations()["peer"]).toBeUndefined();
  });

  it("resets unread and sends a read receipt only when there was unread", async () => {
    wsHandler?.({ type: "plain_message.new", message: makeWire() });
    expect(conversations()["peer"]?.unreadCount).toBe(1);

    apiPostMock.mockResolvedValue({});
    usePlainMessagesStore.getState().markRead("peer");
    expect(conversations()["peer"]?.unreadCount).toBe(0);
    expect(apiPostMock).toHaveBeenCalledWith("/plain/messages/peer/read", {});

    apiPostMock.mockClear();
    usePlainMessagesStore.getState().markRead("peer");
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it("applies WS edited and deleted events to DM threads", () => {
    wsHandler?.({ type: "plain_message.new", message: makeWire({ id: "m-edit" }) });

    wsHandler?.({
      type: "plain_message.edited",
      messageId: "m-edit",
      content: "edited text",
      editedAt: new Date(1_700_000_001_000).toISOString(),
      threadKey: "peer",
      threadKind: "dm",
    });
    expect(conversations()["peer"]?.messages.at(-1)?.content).toBe("edited text");

    wsHandler?.({
      type: "plain_message.deleted",
      messageId: "m-edit",
      threadKey: "peer",
      threadKind: "dm",
    });
    expect(conversations()["peer"]?.messages.some((m) => m.id === "m-edit")).toBe(false);
  });

  it("loads paginated history and marks the conversation history-loaded", async () => {
    apiGetMock.mockResolvedValue({
      messages: [
        makeWire({ id: "h2", clientId: "h2", content: "newer" }),
        makeWire({ id: "h1", clientId: "h1", content: "older" }),
      ],
      hasMore: false,
    });

    await usePlainMessagesStore.getState().loadHistory("peer", "Peer");

    const conv = conversations()["peer"];
    expect(conv?.historyLoaded).toBe(true);
    // API returns newest-first; the store reverses to chronological order.
    expect(conv?.messages.map((m) => m.content)).toEqual(["older", "newer"]);
  });

  it("prepends older messages on loadMoreHistory", async () => {
    apiGetMock.mockResolvedValueOnce({
      messages: [makeWire({ id: "h2", clientId: "h2", content: "page1" })],
      hasMore: true,
      nextCursor: "cursor-1",
    });
    await usePlainMessagesStore.getState().loadHistory("peer", "Peer");

    apiGetMock.mockResolvedValueOnce({
      messages: [makeWire({ id: "h1", clientId: "h1", content: "page2-older" })],
      hasMore: false,
    });
    await usePlainMessagesStore.getState().loadMoreHistory("peer");

    expect(conversations()["peer"]?.messages.map((m) => m.content)).toEqual([
      "page2-older",
      "page1",
    ]);
  });

  it("seeds conversation stubs with server unread counts on loadConversationList", async () => {
    apiGetMock.mockImplementation((path: string) => {
      if (path === "/plain/conversations") {
        return Promise.resolve({
          conversations: [
            {
              peerUserId: "peer",
              peerUsername: "Peer",
              lastMessageAt: new Date(1_700_000_000_000).toISOString(),
              lastMessageContent: "last one",
              lastMessageType: "text",
              lastSenderUserId: "peer",
              unreadCount: 3,
            },
          ],
        });
      }
      return Promise.resolve({ messages: [], hasMore: false });
    });

    await usePlainMessagesStore.getState().loadConversationList();

    const conv = conversations()["peer"];
    expect(conv?.username).toBe("Peer");
    expect(conv?.unreadCount).toBe(3);
    expect(conv?.messages.at(-1)?.content).toBe("last one");
  });
});

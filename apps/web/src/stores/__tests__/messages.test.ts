import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Conversation } from "@/stores/messages";
import type * as MessagesStore from "@/stores/messages";

vi.mock("@/lib/websocket", () => ({
  wsClient: {
    connected: false,
    on: () => () => {},
    onConnectionChange: () => () => {},
    send: vi.fn(),
    setAuthErrorHandler: vi.fn(),
    setWsAuthTokenProvider: vi.fn(),
  },
}));

vi.mock("@seclettr/crypto", () => ({
  fromBase64Url: (v: string) => new Uint8Array(Buffer.from(v, "base64url")),
  toBase64Url: (v: Uint8Array) => Buffer.from(v).toString("base64url"),
  loadDecrypted: vi.fn(async () => null),
  storeEncrypted: vi.fn(async () => {}),
  restoreKeyPairFromPrivateKey: vi.fn(async (pk: Uint8Array) => ({ publicKey: pk, privateKey: pk })),
  deserializeRatchetState: vi.fn(async () => null),
  serializeRatchetState: vi.fn(() => ({})),
  generateKeyPair: vi.fn(),
  generateOneTimePreKeys: vi.fn(),
  bootstrapReceiverSession: vi.fn(),
  x3dhSend: vi.fn(),
  initSender: vi.fn(),
  ratchetEncrypt: vi.fn(),
  ratchetDecrypt: vi.fn(),
  encryptAttachment: vi.fn(),
}));

let useMessagesStore: typeof MessagesStore.useMessagesStore;

function buildConversation(userId: string, unreadCount: number): Conversation {
  return {
    userId,
    username: userId,
    messages: [],
    lastMessageAt: 0,
    unreadCount,
  };
}

describe("useMessagesStore.setActiveConversation", () => {
  beforeAll(async () => {
    Object.defineProperty(globalThis, "location", {
      value: { protocol: "http:", host: "localhost:5173" },
      configurable: true,
      writable: true,
    });

    ({ useMessagesStore } = await import("@/stores/messages"));
  });

  beforeEach(() => {
    useMessagesStore.setState({
      conversations: {},
      activeConversationId: null,
      pendingSessions: new Set(),
      processedMessageIds: new Set(),
      pendingAckMessageIds: new Set(),
      quarantinedMessageIds: new Set(),
    });
  });

  it("clears unread counter for selected conversation", () => {
    useMessagesStore.setState({
      conversations: {
        alice: buildConversation("alice", 3),
        bob: buildConversation("bob", 2),
      },
    });

    useMessagesStore.getState().setActiveConversation("alice");

    const state = useMessagesStore.getState();
    expect(state.activeConversationId).toBe("alice");
    expect(state.conversations["alice"]?.unreadCount).toBe(0);
    expect(state.conversations["bob"]?.unreadCount).toBe(2);
  });

  it("keeps unread counter unchanged when clearing active conversation", () => {
    useMessagesStore.setState({
      conversations: {
        alice: buildConversation("alice", 4),
      },
      activeConversationId: "alice",
    });

    useMessagesStore.getState().setActiveConversation(null);

    const state = useMessagesStore.getState();
    expect(state.activeConversationId).toBeNull();
    expect(state.conversations["alice"]?.unreadCount).toBe(4);
  });

  it("records outbound call events without increasing unread count", () => {
    useMessagesStore.setState({
      conversations: {
        alice: buildConversation("alice", 2),
      },
    });

    useMessagesStore.getState().recordCallEvent({
      userId: "alice",
      username: "Alice",
      mode: "audio",
      direction: "outbound",
      outcome: "ended",
      durationSec: 42,
    });

    const state = useMessagesStore.getState();
    const conversation = state.conversations["alice"];
    expect(conversation?.username).toBe("Alice");
    expect(conversation?.unreadCount).toBe(2);
    expect(conversation?.messages).toHaveLength(1);
    expect(conversation?.messages[0]).toMatchObject({
      type: "call",
      isOwn: true,
      call: {
        mode: "audio",
        direction: "outbound",
        outcome: "ended",
        durationSec: 42,
      },
    });
  });

  it("records inbound call events as unread when the chat is not active", () => {
    useMessagesStore.setState({
      conversations: {
        bob: buildConversation("bob", 1),
      },
    });

    useMessagesStore.getState().recordCallEvent({
      userId: "bob",
      username: "Bob",
      mode: "video",
      direction: "inbound",
      outcome: "missed",
    });

    const state = useMessagesStore.getState();
    const conversation = state.conversations["bob"];
    expect(conversation?.unreadCount).toBe(2);
    expect(conversation?.messages.at(-1)).toMatchObject({
      type: "call",
      isOwn: false,
      call: {
        mode: "video",
        direction: "inbound",
        outcome: "missed",
      },
    });
  });
});

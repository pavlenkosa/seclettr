import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_MESSAGES_PER_CONVERSATION, trimMessagesToCap } from "@/stores/messages/conversation-persistence";
import { replaceOrAppendMessage } from "@/stores/messages/messages-inbound-conversation-runtime";
import type { Message } from "@/stores/messages/types";

const { loadDecryptedMock, storeEncryptedMock } = vi.hoisted(() => ({
  loadDecryptedMock: vi.fn(),
  storeEncryptedMock: vi.fn(),
}));

vi.mock("@seclettr/crypto", () => ({
  loadDecrypted: loadDecryptedMock,
  storeEncrypted: storeEncryptedMock,
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: {
    getState: vi.fn(() => ({
      storageKey: { mock: "cryptokey" },
      deviceId: "device-1",
    })),
  },
}));

vi.mock("@/lib/user-labels", () => ({
  getCachedUserLabel: vi.fn(() => null),
  primeUserLabelCache: vi.fn(),
  shouldHydrateUserLabel: vi.fn(() => false),
}));

function buildMessage(id: string): Message {
  return {
    id,
    senderId: "peer-1",
    senderDeviceId: "device-1",
    content: `body-${id}`,
    type: "text",
    timestamp: Number(id),
    isOwn: false,
    status: "delivered",
  };
}

describe("per-conversation message cap", () => {
  it("keeps newest messages when array exceeds MAX_MESSAGES_PER_CONVERSATION", () => {
    const overCap = Array.from(
      { length: MAX_MESSAGES_PER_CONVERSATION + 5 },
      (_, i) => buildMessage(String(i))
    );

    const trimmed = trimMessagesToCap(overCap);

    expect(trimmed).toHaveLength(MAX_MESSAGES_PER_CONVERSATION);
    expect(trimmed[0]!.id).toBe("5"); // oldest 5 dropped (head trim)
    expect(trimmed.at(-1)!.id).toBe(String(MAX_MESSAGES_PER_CONVERSATION + 4)); // newest kept
  });

  it("does not trim arrays at or below the cap", () => {
    const atCap = Array.from(
      { length: MAX_MESSAGES_PER_CONVERSATION },
      (_, i) => buildMessage(String(i))
    );

    const trimmed = trimMessagesToCap(atCap);

    expect(trimmed).toHaveLength(MAX_MESSAGES_PER_CONVERSATION);
    expect(trimmed[0]!.id).toBe("0");
  });

  it("replaceOrAppendMessage append path trims to cap keeping newest", () => {
    let messages = Array.from(
      { length: MAX_MESSAGES_PER_CONVERSATION },
      (_, i) => buildMessage(String(i))
    );

    const newestId = String(MAX_MESSAGES_PER_CONVERSATION);
    const result = replaceOrAppendMessage(
      messages,
      newestId,
      buildMessage(newestId)
    );

    messages = result.messages;
    expect(messages).toHaveLength(MAX_MESSAGES_PER_CONVERSATION);
    expect(messages.at(-1)!.id).toBe(newestId); // newest appended message kept
    expect(messages[0]!.id).toBe("1"); // head (id 0) dropped
  });
});

describe("persistConversations union-on-persist", () => {
  beforeEach(() => {
    loadDecryptedMock.mockReset();
    storeEncryptedMock.mockReset().mockResolvedValue(undefined);
  });

  it("preserves persisted history beyond the in-memory cap across append+persist", async () => {
    const { persistConversations, restoreConversations } = await import(
      "@/stores/messages/conversation-persistence"
    );
    const persistedMessages = Array.from({ length: 1200 }, (_, i) =>
      buildMessage(`m${i + 1}`)
    );
    loadDecryptedMock.mockResolvedValue({
      "peer-1": {
        userId: "peer-1",
        username: "Peer",
        messages: persistedMessages,
        lastMessageAt: 1200,
        unreadCount: 0,
      },
    });

    // Live state mirrors restore + in-memory trim behavior: restore is uncapped
    // (1200 messages), appends then trim from the head to 500.
    const restored = await restoreConversations();
    expect(restored).not.toBeNull();
    const liveMessages = Array.from(
      { length: 1200 },
      (_, i) => buildMessage(`m${i + 1}`)
    );
    for (let i = 1201; i <= 1205; i += 1) {
      liveMessages.push(buildMessage(`m${i}`));
    }
    const trimmedLive = trimMessagesToCap(liveMessages);
    expect(trimmedLive).toHaveLength(MAX_MESSAGES_PER_CONVERSATION);

    await persistConversations({
      "peer-1": {
        userId: "peer-1",
        username: "Peer",
        messages: trimmedLive,
        lastMessageAt: 1205,
        unreadCount: 0,
      },
    });

    expect(storeEncryptedMock).toHaveBeenCalledTimes(1);
    const written = storeEncryptedMock.mock.calls[0]![2] as Record<
      string,
      { messages: Message[] }
    >;
    const writtenMessages = written["peer-1"]!.messages;
    expect(writtenMessages).toHaveLength(1205);
    const writtenIds = new Set(writtenMessages.map((message) => message.id));
    expect(writtenIds.size).toBe(1205);
    for (let i = 1; i <= 1205; i += 1) {
      expect(writtenIds.has(`m${i}`)).toBe(true);
    }
    // Ordering: timestamp asc (ids m1..m1205 built with ascending timestamps).
    expect(writtenMessages[0]!.id).toBe("m1");
    expect(writtenMessages.at(-1)!.id).toBe("m1205");
  });

  it("dedupes overlapping ids and prefers the live entry for shared ids", async () => {
    const { persistConversations } = await import(
      "@/stores/messages/conversation-persistence"
    );
    loadDecryptedMock.mockResolvedValue({
      "peer-1": {
        userId: "peer-1",
        username: "Peer",
        messages: [buildMessage("m1"), buildMessage("m2")],
        lastMessageAt: 2,
        unreadCount: 0,
      },
    });

    const liveOptimisticUpgrade = {
      ...buildMessage("m2"),
      status: "read" as const,
    };
    await persistConversations({
      "peer-1": {
        userId: "peer-1",
        username: "Peer",
        messages: [liveOptimisticUpgrade, buildMessage("m3")],
        lastMessageAt: 3,
        unreadCount: 0,
      },
    });

    const written = storeEncryptedMock.mock.calls[0]![2] as Record<
      string,
      { messages: Message[] }
    >;
    const writtenMessages = written["peer-1"]!.messages;
    expect(writtenMessages.map((message) => message.id)).toEqual([
      "m1",
      "m2",
      "m3",
    ]);
    expect(
      writtenMessages.find((message) => message.id === "m2")?.status
    ).toBe("read"); // live wins for shared ids
  });

  it("keeps a persisted-only conversation and persisted-only messages missing from live", async () => {
    const { persistConversations } = await import(
      "@/stores/messages/conversation-persistence"
    );
    loadDecryptedMock.mockResolvedValue({
      "peer-1": {
        userId: "peer-1",
        username: "Peer",
        messages: [buildMessage("m1"), buildMessage("m2")],
        lastMessageAt: 2,
        unreadCount: 0,
      },
      "peer-2": {
        userId: "peer-2",
        username: "Peer 2",
        messages: [buildMessage("p1")],
        lastMessageAt: 1,
        unreadCount: 0,
      },
    });

    // Live dropped m1 (e.g. removed optimistic message) and whole peer-2
    // conversation: union-on-persist must keep both from the persisted record.
    await persistConversations({
      "peer-1": {
        userId: "peer-1",
        username: "Peer",
        messages: [buildMessage("m2")],
        lastMessageAt: 2,
        unreadCount: 0,
      },
    });

    const written = storeEncryptedMock.mock.calls[0]![2] as Record<
      string,
      { messages: Message[] }
    >;
    expect(Object.keys(written).sort()).toEqual(["peer-1", "peer-2"]);
    expect(written["peer-1"]!.messages.map((message) => message.id)).toEqual([
      "m1",
      "m2",
    ]);
    expect(written["peer-2"]!.messages.map((message) => message.id)).toEqual([
      "p1",
    ]);
  });

  it("writes the live record unchanged when nothing was persisted yet", async () => {
    const { persistConversations } = await import(
      "@/stores/messages/conversation-persistence"
    );
    loadDecryptedMock.mockResolvedValue(null);

    await persistConversations({
      "peer-1": {
        userId: "peer-1",
        username: "Peer",
        messages: [buildMessage("m1")],
        lastMessageAt: 1,
        unreadCount: 0,
      },
    });

    const written = storeEncryptedMock.mock.calls[0]![2] as Record<
      string,
      { messages: Message[] }
    >;
    expect(written["peer-1"]!.messages.map((message) => message.id)).toEqual([
      "m1",
    ]);
  });
});

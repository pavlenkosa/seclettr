// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { cacheStorageKey, loadConversationsCache, saveConversationsCache } from "../plain-messages-cache";
import type { PlainConversation } from "../types";

const USER_A = "user-a";
const USER_B = "user-b";
const DEVICE = "device-1";

function conversation(overrides: Partial<PlainConversation> = {}): PlainConversation {
  return {
    userId: "peer-1",
    username: "Peer One",
    messages: [
      {
        id: "m1",
        clientId: "c1",
        senderId: "peer-1",
        senderName: "Peer One",
        content: "hello",
        type: "text",
        timestamp: 1_700_000_000_000,
        isOwn: false,
        status: "sent",
      },
    ],
    lastMessageAt: 1_700_000_000_000,
    unreadCount: 2,
    hasMore: false,
    historyLoaded: true,
    ...overrides,
  };
}

describe("plain-messages-cache", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("derives a per-user storage key", () => {
    expect(cacheStorageKey(USER_A)).toBe("plain_convs_v2_user-a");
    expect(cacheStorageKey(USER_A)).not.toBe(cacheStorageKey(USER_B));
  });

  it("round-trips a conversation summary through encrypted storage", async () => {
    const conversations = { "peer-1": conversation() };
    await saveConversationsCache(USER_A, DEVICE, conversations);

    const restored = await loadConversationsCache(USER_A, DEVICE);
    expect(Object.keys(restored)).toEqual(["peer-1"]);
    expect(restored["peer-1"]?.username).toBe("Peer One");
    expect(restored["peer-1"]?.unreadCount).toBe(2);
    expect(restored["peer-1"]?.messages.at(-1)?.content).toBe("hello");
  });

  it("marks restored conversations as not-yet-history-loaded", async () => {
    await saveConversationsCache(USER_A, DEVICE, { "peer-1": conversation() });
    const restored = await loadConversationsCache(USER_A, DEVICE);
    expect(restored["peer-1"]?.historyLoaded).toBe(false);
    expect(restored["peer-1"]?.hasMore).toBe(false);
  });

  it("does not leak cache to another user on the same browser", async () => {
    await saveConversationsCache(USER_A, DEVICE, { "peer-1": conversation() });
    // USER_B reads its own (empty) storage key — never USER_A's data.
    const restored = await loadConversationsCache(USER_B, DEVICE);
    expect(restored).toEqual({});
  });

  it("fails closed when the device identity does not match", async () => {
    await saveConversationsCache(USER_A, DEVICE, { "peer-1": conversation() });
    // Same user, different device → AES-GCM key mismatch → empty result.
    const restored = await loadConversationsCache(USER_A, "device-2");
    expect(restored).toEqual({});
  });

  it("returns an empty record when nothing is cached", async () => {
    expect(await loadConversationsCache(USER_A, DEVICE)).toEqual({});
  });

  it("persists an empty-message conversation without a last message", async () => {
    await saveConversationsCache(USER_A, DEVICE, {
      "peer-1": conversation({ messages: [] }),
    });
    const restored = await loadConversationsCache(USER_A, DEVICE);
    expect(restored["peer-1"]?.messages).toEqual([]);
  });
});

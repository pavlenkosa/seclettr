import type { StoreApi } from "zustand";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import type { PlainMessage, PlainMessageType } from "./types";
import type { PlainMessagesState } from "./plain-messages-store";
import { loadConversationsCache, saveConversationsCache } from "./plain-messages-cache";
import { wireToPlainMessage, type WireHistoryResponse } from "./plain-messages-wire";

/**
 * History/bootstrap runtime for the plain DM store.
 *
 * Extracted from the `plain-messages-store.ts` factory closure. Owns the
 * conversation-list bootstrap and paginated history loading, with the store
 * `set/get` and identity accessors passed in as explicit dependencies.
 *
 * Behavior is byte-for-byte identical to the previous in-store definitions:
 * `loadConversationList` restores the encrypted cache before the API response,
 * overwrites unread counts from the server, and kicks off background history
 * prefetch at batch size 3; `loadHistory` is idempotent via `historyLoaded`;
 * `loadMoreHistory` prepends older pages. See `plain-messages-store.test.ts`.
 */
export interface PlainMessagesHistoryDeps {
  readonly set: StoreApi<PlainMessagesState>["setState"];
  readonly get: StoreApi<PlainMessagesState>["getState"];
  readonly getMyUserId: () => string | null;
  readonly getMyUsername: () => string | null;
  readonly getMyDeviceId: () => string;
  readonly conversationKeyFor: (otherUserId: string) => string;
}

export interface PlainMessagesHistoryRuntime {
  loadConversationList: () => Promise<void>;
  loadHistory: (userId: string, username: string) => Promise<void>;
  loadMoreHistory: (userId: string) => Promise<void>;
}

export function createPlainMessagesHistoryRuntime(
  deps: PlainMessagesHistoryDeps
): PlainMessagesHistoryRuntime {
  const { set, get, getMyUserId, getMyUsername, getMyDeviceId, conversationKeyFor } = deps;

  async function loadConversationList(): Promise<void> {
    // Restore from encrypted cache immediately — visible before API responds
    const myUserId = getMyUserId() ?? "";
    const deviceId = getMyDeviceId();
    if (myUserId && deviceId !== "unknown") {
      const cached = await loadConversationsCache(myUserId, deviceId);
      if (Object.keys(cached).length > 0) {
        set((state) => ({
          conversations: {
            ...cached,
            ...state.conversations, // don't overwrite WS-received data
          },
        }));
      }
    }

    try {
      const data = await api.get<{
        conversations: Array<{
          peerUserId: string;
          peerUsername: string;
          lastMessageAt: string;
          lastMessageContent: string;
          lastMessageType: string;
          lastSenderUserId: string;
          unreadCount: number;
        }>;
      }>("/plain/conversations");

      const peers: Array<{ userId: string; username: string }> = [];

      set((state) => {
        const next = { ...state.conversations };
        for (const c of data.conversations) {
          const key = conversationKeyFor(c.peerUserId);
          const lastTs = new Date(c.lastMessageAt).getTime();
          peers.push({ userId: c.peerUserId, username: c.peerUsername });
          if (!next[key]) {
            const isOwnLast = c.lastSenderUserId === myUserId;
            const stub: PlainMessage = {
              id: `stub-${c.peerUserId}`,
              clientId: `stub-${c.peerUserId}`,
              senderId: c.lastSenderUserId,
              senderName: isOwnLast ? (getMyUsername() ?? "") : c.peerUsername,
              content: c.lastMessageContent,
              type: c.lastMessageType as PlainMessageType,
              timestamp: lastTs,
              isOwn: isOwnLast,
              status: "sent",
            };
            next[key] = {
              userId: c.peerUserId,
              username: c.peerUsername,
              messages: [stub],
              lastMessageAt: lastTs,
              unreadCount: c.unreadCount,
              hasMore: false,
              historyLoaded: false,
            };
          } else {
            // Update unread count from server even if conversation already exists
            next[key] = { ...next[key]!, unreadCount: c.unreadCount };
          }
        }
        return { conversations: next };
      });

      // Persist updated list to cache
      void saveConversationsCache(getMyUserId() ?? "", getMyDeviceId(), get().conversations);

      // Load full history for all conversations in background, 3 at a time
      void loadAllHistoriesBatched(peers);
    } catch (err) {
      logger.error("[PlainMsg] loadConversationList failed", err);
    }
  }

  async function loadAllHistoriesBatched(
    peers: Array<{ userId: string; username: string }>
  ): Promise<void> {
    const BATCH = 3;
    for (let i = 0; i < peers.length; i += BATCH) {
      await Promise.all(
        peers.slice(i, i + BATCH).map((p) => loadHistory(p.userId, p.username))
      );
    }
  }

  async function loadHistory(userId: string, username: string): Promise<void> {
    const key = conversationKeyFor(userId);
    const existing = get().conversations[key];
    if (existing?.historyLoaded) return;

    try {
      const data = await api.get<WireHistoryResponse>(
        `/plain/messages/${encodeURIComponent(userId)}?limit=50`
      );
      const myUserId = getMyUserId() ?? "";
      const messages = [...data.messages]
        .reverse()
        .map((w) => wireToPlainMessage(w, myUserId));

      set((state) => {
        const prev = state.conversations[key];
        return {
          conversations: {
            ...state.conversations,
            [key]: {
              userId,
              username: prev?.username ?? username,
              messages,
              lastMessageAt: messages.at(-1)?.timestamp ?? prev?.lastMessageAt ?? 0,
              unreadCount: prev?.unreadCount ?? 0,
              nextCursor: data.nextCursor,
              hasMore: data.hasMore,
              historyLoaded: true,
            },
          },
        };
      });
      void saveConversationsCache(getMyUserId() ?? "", getMyDeviceId(), get().conversations);
    } catch (err) {
      logger.error("[PlainMsg] loadHistory failed", err);
    }
  }

  async function loadMoreHistory(userId: string): Promise<void> {
    const key = conversationKeyFor(userId);
    const conv = get().conversations[key];
    if (!conv?.hasMore || !conv.nextCursor) return;

    try {
      const data = await api.get<WireHistoryResponse>(
        `/plain/messages/${encodeURIComponent(userId)}?limit=50&before=${encodeURIComponent(conv.nextCursor)}`
      );
      const myUserId = getMyUserId() ?? "";
      const older = [...data.messages].reverse().map((w) => wireToPlainMessage(w, myUserId));

      set((state) => {
        const existing = state.conversations[key];
        if (!existing) return state;
        return {
          conversations: {
            ...state.conversations,
            [key]: {
              ...existing,
              messages: [...older, ...existing.messages],
              nextCursor: data.nextCursor,
              hasMore: data.hasMore,
            },
          },
        };
      });
    } catch (err) {
      logger.error("[PlainMsg] loadMoreHistory failed", err);
    }
  }

  return { loadConversationList, loadHistory, loadMoreHistory };
}

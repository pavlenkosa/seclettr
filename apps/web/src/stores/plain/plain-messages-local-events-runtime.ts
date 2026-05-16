import type { StoreApi } from "zustand";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/websocket";
import { logger } from "@/lib/logger";
import type { PlainConversation, PlainMessage } from "./types";
import type { PlainMessagesState } from "./plain-messages-store";
import { cacheStorageKey } from "./plain-messages-cache";

/**
 * Local-event runtime for the plain DM store.
 *
 * Extracted from the `plain-messages-store.ts` factory closure. Owns the
 * actions that mutate local conversation state without a server message round
 * trip: call-event recording, read marking (with read-receipt emission), and
 * session reset. Dependencies are passed in explicitly instead of captured.
 *
 * Behavior is byte-for-byte identical to the previous in-store definitions:
 * `markRead` resets unread first and emits a read receipt only when there was
 * unread; `reset` clears the encrypted cache for the current user.
 */
export interface PlainMessagesLocalEventsDeps {
  readonly set: StoreApi<PlainMessagesState>["setState"];
  readonly getMyUserId: () => string | null;
  readonly getMyUsername: () => string | null;
  readonly conversationKeyFor: (otherUserId: string) => string;
}

export interface RecordCallEventParams {
  userId: string;
  username: string;
  mode: "audio" | "video";
  direction: "inbound" | "outbound";
  outcome: "ended" | "declined" | "missed";
  durationSec?: number;
}

export interface PlainMessagesLocalEventsRuntime {
  recordCallEvent: (params: RecordCallEventParams) => void;
  markRead: (userId: string) => void;
  reset: () => void;
}

export function createPlainMessagesLocalEventsRuntime(
  deps: PlainMessagesLocalEventsDeps
): PlainMessagesLocalEventsRuntime {
  const { set, getMyUserId, getMyUsername, conversationKeyFor } = deps;

  function recordCallEvent({
    userId,
    username,
    mode,
    direction,
    outcome,
    durationSec,
  }: RecordCallEventParams): void {
    const key = conversationKeyFor(userId);
    const myUserId = getMyUserId();
    const callMessage: PlainMessage = {
      id: `call-${crypto.randomUUID()}`,
      clientId: crypto.randomUUID(),
      senderId: direction === "outbound" ? (myUserId ?? userId) : userId,
      senderName: direction === "outbound" ? (getMyUsername() ?? "") : username,
      content: "",
      type: "call",
      call: {
        mode,
        direction,
        outcome,
        durationSec: Number.isFinite(durationSec) && (durationSec ?? 0) > 0 ? durationSec : undefined,
      },
      timestamp: Date.now(),
      isOwn: direction === "outbound",
      status: "sent",
    };

    set((state) => {
      const existing = state.conversations[key];
      const conv: PlainConversation = existing ?? {
        userId,
        username,
        messages: [],
        lastMessageAt: 0,
        unreadCount: 0,
        hasMore: false,
        historyLoaded: false,
      };
      return {
        conversations: {
          ...state.conversations,
          [key]: {
            ...conv,
            messages: [...conv.messages, callMessage],
            lastMessageAt: callMessage.timestamp,
          },
        },
      };
    });
  }

  async function sendReadReceipt(peerUserId: string): Promise<void> {
    try {
      await api.post(`/plain/messages/${encodeURIComponent(peerUserId)}/read`, {});
    } catch (err) {
      logger.warn("[PlainMsg] sendReadReceipt failed", err);
    }
  }

  function markRead(userId: string): void {
    const key = conversationKeyFor(userId);
    let hadUnread = false;
    set((state) => {
      const conv = state.conversations[key];
      if (!conv || conv.unreadCount === 0) return state;
      hadUnread = true;
      return {
        conversations: {
          ...state.conversations,
          [key]: { ...conv, unreadCount: 0 },
        },
      };
    });
    if (hadUnread) void sendReadReceipt(userId);
  }

  function reset(): void {
    const myUserId = getMyUserId();
    if (myUserId) {
      try { localStorage.removeItem(cacheStorageKey(myUserId)); } catch { /* ignore */ }
    }
    set({
      conversations: {},
      wsConnected: wsClient.connected,
    });
  }

  return { recordCallEvent, markRead, reset };
}

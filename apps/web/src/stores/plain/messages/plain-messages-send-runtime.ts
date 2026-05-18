import type { StoreApi } from "zustand";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import { PLAIN_PROTOCOL_VERSION } from "@seclettr/protocol";
import type { PlainMessage, PlainReplyMeta } from "../types";
import type { PlainMessagesState } from "./plain-messages-store";
import { mergeIncomingMessage, type WireSendResponse } from "./plain-messages-wire";

/**
 * Send/edit/delete runtime for plain DM messages.
 *
 * Extracted from the `plain-messages-store.ts` factory closure. It receives the
 * store `set/get` and identity accessors as dependencies instead of capturing
 * them implicitly, so the send flow can be read and tested as one unit.
 *
 * Behavior is byte-for-byte identical to the previous in-store definitions:
 * optimistic insert before the API call, immediate optimistic→sent patch
 * before the WS echo, and `error` fallback on failure.
 */
export interface PlainMessagesSendDeps {
  readonly set: StoreApi<PlainMessagesState>["setState"];
  readonly getMyUserId: () => string | null;
  readonly getMyUsername: () => string | null;
  readonly conversationKeyFor: (otherUserId: string) => string;
}

export interface PlainMessagesSendRuntime {
  sendText: (
    recipientUserId: string,
    recipientUsername: string,
    content: string,
    replyTo?: PlainReplyMeta
  ) => Promise<void>;
  editMessage: (conversationUserId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (conversationUserId: string, messageId: string) => Promise<void>;
}

export function createPlainMessagesSendRuntime(deps: PlainMessagesSendDeps): PlainMessagesSendRuntime {
  const { set, getMyUserId, getMyUsername, conversationKeyFor } = deps;

  async function sendText(
    recipientUserId: string,
    recipientUsername: string,
    content: string,
    replyTo?: PlainReplyMeta
  ): Promise<void> {
    const myUserId = getMyUserId();
    const myUsername = getMyUsername();
    if (!myUserId || !myUsername) return;

    const clientId = crypto.randomUUID();
    const key = conversationKeyFor(recipientUserId);
    const optimistic: PlainMessage = {
      id: clientId,
      clientId,
      senderId: myUserId,
      senderName: myUsername,
      content,
      type: "text",
      replyTo,
      timestamp: Date.now(),
      isOwn: true,
      status: "sending",
    };

    set((state) => ({
      conversations: mergeIncomingMessage(
        state.conversations,
        key,
        optimistic,
        recipientUsername
      ),
    }));

    try {
      const res = await api.post<WireSendResponse>(
        `/plain/messages/${encodeURIComponent(recipientUserId)}`,
        {
          version: PLAIN_PROTOCOL_VERSION,
          clientId,
          content,
          messageType: "text",
          replyToId: replyTo?.id,
        }
      );
      // Update optimistic message immediately; WS echo will arrive later and be deduped
      set((state) => {
        const conv = state.conversations[key];
        if (!conv) return state;
        return {
          conversations: {
            ...state.conversations,
            [key]: {
              ...conv,
              messages: conv.messages.map((m) =>
                m.clientId === clientId
                  ? { ...m, id: res.id, status: "sent" as const }
                  : m
              ),
            },
          },
        };
      });
    } catch (err) {
      logger.error("[PlainMsg] sendText failed", err);
      set((state) => {
        const conv = state.conversations[key];
        if (!conv) return state;
        return {
          conversations: {
            ...state.conversations,
            [key]: {
              ...conv,
              messages: conv.messages.map((m) =>
                m.clientId === clientId ? { ...m, status: "error" as const } : m
              ),
            },
          },
        };
      });
    }
  }

  async function editMessage(conversationUserId: string, messageId: string, content: string): Promise<void> {
    const key = conversationKeyFor(conversationUserId);
    try {
      await api.patch(`/plain/messages/${encodeURIComponent(messageId)}`, { content });
      // Optimistic update — WS event will confirm with server editedAt
      const now = Date.now();
      set((state) => {
        const conv = state.conversations[key];
        if (!conv) return state;
        return {
          conversations: {
            ...state.conversations,
            [key]: {
              ...conv,
              messages: conv.messages.map((m) =>
                m.id === messageId ? { ...m, content, editedAt: now } : m
              ),
            },
          },
        };
      });
    } catch (err) {
      logger.error("[PlainMsg] editMessage failed", err);
    }
  }

  async function deleteMessage(conversationUserId: string, messageId: string): Promise<void> {
    const key = conversationKeyFor(conversationUserId);
    try {
      await api.delete(`/plain/messages/${encodeURIComponent(messageId)}`);
      set((state) => {
        const conv = state.conversations[key];
        if (!conv) return state;
        return {
          conversations: {
            ...state.conversations,
            [key]: {
              ...conv,
              messages: conv.messages.filter((m) => m.id !== messageId),
            },
          },
        };
      });
    } catch (err) {
      logger.error("[PlainMsg] deleteMessage failed", err);
    }
  }

  return { sendText, editMessage, deleteMessage };
}

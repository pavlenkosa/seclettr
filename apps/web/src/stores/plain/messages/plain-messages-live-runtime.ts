import type { StoreApi } from "zustand";
import type { WsServerMessage } from "@seclettr/protocol";
import { wsClient } from "@/lib/websocket";
import { showNativeDmNotification } from "@/lib/native-notifications";
import { logger } from "@/lib/logger";
import type { PlainMessage } from "../types";
import type { PlainMessagesState } from "./plain-messages-store";
import { mergeIncomingMessage, wireToPlainMessage, type WirePlainMessage } from "./plain-messages-wire";
import { cacheAppendMessages, type ConvKey } from "./plain-message-cache-db";

/**
 * Live WebSocket runtime for plain DM messages.
 *
 * Extracted from the `plain-messages-store.ts` factory closure. Owns the
 * `plain_message.*` event handling and the WS subscription lifecycle, with the
 * store `set/get` and identity accessor passed in as explicit dependencies.
 *
 * Behavior is byte-for-byte identical to the previous in-store definitions:
 * DM-only ownership (`groupId` events are skipped, `threadKind !== "dm"` is
 * ignored), dedupe through `mergeIncomingMessage`, and the same read-status
 * patch semantics — see `plain-messages-store.test.ts`.
 */
export interface PlainMessagesLiveDeps {
  readonly set: StoreApi<PlainMessagesState>["setState"];
  readonly get: StoreApi<PlainMessagesState>["getState"];
  readonly getMyUserId: () => string | null;
}

export interface PlainMessagesLiveRuntime {
  handleIncomingWsEvent: (message: WsServerMessage) => void;
  subscribe: () => () => void;
}

export function createPlainMessagesLiveRuntime(deps: PlainMessagesLiveDeps): PlainMessagesLiveRuntime {
  const { set, get, getMyUserId } = deps;

  function handleMessageNew(message: WsServerMessage & { type: "plain_message.new" }): void {
    const myUserId = getMyUserId();
    if (!myUserId) return;
    const wire = message.message as WirePlainMessage;
    if (wire.groupId) return;
    const conversationKey = wire.senderUserId === myUserId
      ? (wire.recipientUserId ?? "")
      : wire.senderUserId;
    if (!conversationKey) return;

    const msg = wireToPlainMessage(wire, myUserId);
    const peerUsername = wire.senderUserId === myUserId
      ? (get().conversations[conversationKey]?.username ?? wire.recipientUsername ?? conversationKey)
      : wire.senderUsername;

    set((state) => ({
      conversations: mergeIncomingMessage(
        state.conversations,
        conversationKey,
        msg,
        peerUsername
      ),
    }));

    if (!msg.isOwn) {
      void showNativeDmNotification({
        senderUserId: wire.senderUserId,
        senderUsername: wire.senderUsername ?? wire.senderUserId,
        content: wire.content ?? "",
        messageType: wire.messageType ?? "text",
      });
    }

    void cacheAppendMessages(`dm:${conversationKey}` as ConvKey, [msg], peerUsername).catch(() => {
      logger.warn("[PlainMsg] failed to cache incoming message");
    });
  }

  function handleMessageEdited(message: WsServerMessage & { type: "plain_message.edited" }): void {
    const { messageId, content, editedAt, threadKey, threadKind } = message;
    if (threadKind !== "dm") return;
    const editedAtMs = new Date(editedAt).getTime();
    set((state) => {
      const conv = state.conversations[threadKey];
      if (!conv) return state;
      return {
        conversations: {
          ...state.conversations,
          [threadKey]: {
            ...conv,
            messages: conv.messages.map((m) =>
              m.id === messageId ? { ...m, content, editedAt: editedAtMs } : m
            ),
          },
        },
      };
    });
  }

  function handleMessageDeleted(message: WsServerMessage & { type: "plain_message.deleted" }): void {
    const { messageId, threadKey, threadKind } = message;
    if (threadKind !== "dm") return;
    set((state) => {
      const conv = state.conversations[threadKey];
      if (!conv) return state;
      return {
        conversations: {
          ...state.conversations,
          [threadKey]: {
            ...conv,
            messages: conv.messages.filter((m) => m.id !== messageId),
          },
        },
      };
    });
  }

  function handleMessageRead(message: WsServerMessage & { type: "plain_message.read" }): void {
    const { messageIds, threadKey } = message;
    const idSet = new Set(messageIds);
    set((state) => {
      const conv = state.conversations[threadKey];
      if (!conv) return state;
      const messages: PlainMessage[] = conv.messages.map((m) =>
        m.isOwn && idSet.has(m.id) ? { ...m, status: "read" as PlainMessage["status"] } : m
      );
      return {
        conversations: {
          ...state.conversations,
          [threadKey]: { ...conv, messages },
        },
      };
    });
  }

  function handleIncomingWsEvent(message: WsServerMessage): void {
    if (message.type === "plain_message.new") {
      handleMessageNew(message);
    } else if (message.type === "plain_message.edited") {
      handleMessageEdited(message);
    } else if (message.type === "plain_message.deleted") {
      handleMessageDeleted(message);
    } else if (message.type === "plain_message.read") {
      handleMessageRead(message);
    }
  }

  function subscribe(): () => void {
    const unsubscribeMessages = wsClient.on((message) => {
      if (
        message.type === "plain_message.new" ||
        message.type === "plain_message.edited" ||
        message.type === "plain_message.deleted" ||
        message.type === "plain_message.read"
      ) {
        // message is already WsServerMessage — pass directly, no cast needed.
        handleIncomingWsEvent(message);
      }
    });

    const unsubscribeConnection = wsClient.onConnectionChange((connected) => {
      set({ wsConnected: connected });
    });

    return () => {
      unsubscribeMessages();
      unsubscribeConnection();
    };
  }

  return { handleIncomingWsEvent, subscribe };
}

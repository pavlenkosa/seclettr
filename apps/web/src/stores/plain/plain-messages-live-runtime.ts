import type { StoreApi } from "zustand";
import { wsClient } from "@/lib/websocket";
import type { PlainMessage } from "./types";
import type { PlainMessagesState } from "./plain-messages-store";
import { mergeIncomingMessage, wireToPlainMessage, type WirePlainMessage } from "./plain-messages-wire";

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
  handleIncomingWsEvent: (message: { type: string; [k: string]: unknown }) => void;
  subscribe: () => () => void;
}

export function createPlainMessagesLiveRuntime(deps: PlainMessagesLiveDeps): PlainMessagesLiveRuntime {
  const { set, get, getMyUserId } = deps;

  function handleIncomingWsEvent(message: { type: string; [k: string]: unknown }): void {
    const myUserId = getMyUserId();
    if (!myUserId) return;

    if (message.type === "plain_message.new") {
      const wire = message.message as WirePlainMessage;
      // Group messages are routed through the same plain_message.new event but
      // owned by plain-groups-store. Skip them here so the same message doesn't
      // also land in the sender's DM thread.
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
      return;
    }

    if (message.type === "plain_message.edited") {
      const { messageId, content, editedAt, threadKey, threadKind } = message as unknown as {
        messageId: string;
        content: string;
        editedAt: string;
        threadKey: string;
        threadKind: string;
      };
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
      return;
    }

    if (message.type === "plain_message.deleted") {
      const { messageId, threadKey, threadKind } = message as unknown as {
        messageId: string;
        threadKey: string;
        threadKind: string;
      };
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
      return;
    }

    if (message.type === "plain_message.read") {
      // Peer read our messages — update status to "read" for the affected thread
      const { messageIds, threadKey } = message as unknown as {
        messageIds: string[];
        threadKey: string;
      };
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
  }

  function subscribe(): () => void {
    const unsubscribeMessages = wsClient.on((message) => {
      if (
        message.type === "plain_message.new" ||
        message.type === "plain_message.edited" ||
        message.type === "plain_message.deleted" ||
        message.type === "plain_message.read"
      ) {
        handleIncomingWsEvent(message as unknown as { type: string; [k: string]: unknown });
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

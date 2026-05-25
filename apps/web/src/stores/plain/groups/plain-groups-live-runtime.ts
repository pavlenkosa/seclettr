import type { StoreApi } from "zustand";
import { wsClient } from "@/lib/websocket";
import { showNativeGroupNotification } from "@/lib/native-notifications";
import { logger } from "@/lib/logger";
import type { PlainGroupsState } from "./plain-groups-store";
import {
  mergeGroupMessage,
  wireToPlainGroupMessage,
  type WirePlainGroupMessage,
} from "./plain-groups-wire";
import { cacheAppendMessages, type ConvKey } from "../messages/plain-message-cache-db";

/**
 * Live WebSocket runtime for plain group messages.
 *
 * Extracted from the `plain-groups-store.ts` closure. Owns the
 * `plain_message.*` event handling for group threads and the WS subscription
 * lifecycle, with store `set` and identity accessors passed in explicitly.
 */
export interface PlainGroupsLiveDeps {
  readonly set: StoreApi<PlainGroupsState>["setState"];
  readonly getMyUserId: () => string | null;
}

export interface PlainGroupsLiveRuntime {
  handleIncomingWsEvent: (message: { type: string; [k: string]: unknown }) => void;
  subscribe: () => () => void;
}

export function createPlainGroupsLiveRuntime(
  deps: PlainGroupsLiveDeps
): PlainGroupsLiveRuntime {
  const { set, getMyUserId } = deps;

  function handleIncomingWsEvent(message: { type: string; [k: string]: unknown }): void {
    const myUserId = getMyUserId();
    if (!myUserId) return;

    if (message.type === "plain_message.new") {
      const wire = message.message as WirePlainGroupMessage;
      const groupId = wire.groupId;
      if (!groupId) return;
      const msg = wireToPlainGroupMessage(wire, myUserId);
      let resolvedGroupName = "";
      set((state) => {
        resolvedGroupName = state.groups[groupId]?.name ?? "";
        return { groups: mergeGroupMessage(state.groups, groupId, msg) };
      });

      if (!msg.isOwn) {
        void showNativeGroupNotification({
          groupId,
          groupName: resolvedGroupName,
          senderUsername: wire.senderUsername ?? wire.senderUserId,
          content: wire.content ?? "",
          messageType: wire.messageType ?? "text",
        });
      }

      void cacheAppendMessages(
        `group:${groupId}` as ConvKey,
        [msg],
        resolvedGroupName || groupId
      ).catch(() => {
        logger.warn("[PlainGroups] failed to cache incoming message");
      });
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
      if (threadKind !== "group") return;
      const editedAtMs = new Date(editedAt).getTime();
      set((state) => {
        const g = state.groups[threadKey];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [threadKey]: {
              ...g,
              messages: g.messages.map((m) =>
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
      if (threadKind !== "group") return;
      set((state) => {
        const g = state.groups[threadKey];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [threadKey]: {
              ...g,
              messages: g.messages.filter((m) => m.id !== messageId),
            },
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
        message.type === "plain_message.deleted"
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

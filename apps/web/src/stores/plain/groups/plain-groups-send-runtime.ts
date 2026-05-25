import type { StoreApi } from "zustand";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";
import { PLAIN_PROTOCOL_VERSION } from "@seclettr/protocol";
import type { PlainGroupsState } from "./plain-groups-store";
import type { PlainMessage, PlainReplyMeta } from "../types";
import { mergeGroupMessage, type WireSendResponse } from "./plain-groups-wire";

/**
 * Send/edit/delete runtime for plain group messages.
 *
 * Extracted from the `plain-groups-store.ts` factory closure. Owns only text
 * send and local message mutation flows; attachment send, live WS handling,
 * and local unread/reset behavior stay outside this file.
 *
 * Behavior is byte-for-byte identical to the previous in-store definitions:
 * optimistic insert before API for `sendText`, same `error` fallback on
 * failure, and the same optimistic local patch/removal after edit/delete.
 */
export interface PlainGroupsSendDeps {
  readonly set: StoreApi<PlainGroupsState>["setState"];
  readonly getMyUserId: () => string | null;
  readonly getMyUsername: () => string | null;
}

export interface PlainGroupsSendRuntime {
  sendText: (groupId: string, content: string, replyTo?: PlainReplyMeta) => Promise<void>;
  editMessage: (groupId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (groupId: string, messageId: string) => Promise<void>;
}

export function createPlainGroupsSendRuntime(
  deps: PlainGroupsSendDeps
): PlainGroupsSendRuntime {
  const { set, getMyUserId, getMyUsername } = deps;

  async function sendText(
    groupId: string,
    content: string,
    replyTo?: PlainReplyMeta
  ): Promise<void> {
    const myUserId = getMyUserId();
    const myUsername = getMyUsername();
    if (!myUserId || !myUsername) return;

    const clientId = crypto.randomUUID();
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

    set((state) => ({ groups: mergeGroupMessage(state.groups, groupId, optimistic) }));

    try {
      await api.post<WireSendResponse>(
        `/plain/groups/${encodeURIComponent(groupId)}/messages`,
        {
          version: PLAIN_PROTOCOL_VERSION,
          clientId,
          content,
          messageType: "text",
          replyToId: replyTo?.id,
        }
      );
    } catch (err) {
      logger.error("[PlainGroups] sendText failed", err);
      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              messages: g.messages.map((m) =>
                m.clientId === clientId ? { ...m, status: "error" as const } : m
              ),
            },
          },
        };
      });
    }
  }

  async function editMessage(
    groupId: string,
    messageId: string,
    content: string
  ): Promise<void> {
    try {
      await api.patch(
        `/plain/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}`,
        { content }
      );
      const now = Date.now();
      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              messages: g.messages.map((m) =>
                m.id === messageId ? { ...m, content, editedAt: now } : m
              ),
            },
          },
        };
      });
    } catch (err) {
      logger.error("[PlainGroups] editMessage failed", err);
    }
  }

  async function deleteMessage(groupId: string, messageId: string): Promise<void> {
    try {
      await api.delete(
        `/plain/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}`
      );
      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              messages: g.messages.filter((m) => m.id !== messageId),
            },
          },
        };
      });
    } catch (err) {
      logger.error("[PlainGroups] deleteMessage failed", err);
    }
  }

  return { sendText, editMessage, deleteMessage };
}

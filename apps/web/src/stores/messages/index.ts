import { create } from "zustand";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/websocket";
import {
  fetchUserLabel,
  primeUserLabelCache,
  shouldHydrateUserLabel,
} from "@/lib/user-labels";
import { sanitizeDisplayText, sanitizeDisplayTextOrFallback } from "@/lib/display-text";
import {
  persistConversations,
  persistPendingReadReceiptMessageIds,
  trimMessageIds,
} from "./conversation-persistence";
import { createMessagesHistoryRuntime } from "./createMessagesHistoryRuntime";
import { createMessagesInboundRuntime } from "./createMessagesInboundRuntime";
import { createMessagesLiveSyncRuntime } from "./createMessagesLiveSyncRuntime";
import { createMessagesOutboundRuntime } from "./createMessagesOutboundRuntime";
import { createMessagesRuntimeShared } from "./messages-runtime-shared";
import type {
  Conversation,
  Message,
  MessagesState,
} from "./messages-store-runtime-types";

export type {
  AttachmentMessageMeta,
  CallMessageMeta,
  MessageReplyMeta,
  Message,
  Conversation,
  PeerIdentityAlert,
} from "./types";

function createBaseState() {
  return {
    conversations: {} as Record<string, Conversation>,
    activeConversationId: null as string | null,
    pendingSessions: new Set<string>(),
    processedMessageIds: new Set<string>(),
    pendingAckMessageIds: new Set<string>(),
    quarantinedMessageIds: new Set<string>(),
    pendingReadReceiptMessageIds: new Set<string>(),
    presenceByUser: {} as Record<
      string,
      { online: boolean; lastSeenAt?: string; updatedAt: number }
    >,
    typingByUser: {} as Record<string, { typing: boolean; updatedAt: number }>,
    wsConnected: wsClient.connected,
    historyLoaded: false,
  };
}

export const useMessagesStore = create<MessagesState>((set, get) => {
  const shared = createMessagesRuntimeShared();
  const historyRuntime = createMessagesHistoryRuntime({ set, get, shared });

  // Lazy ref breaks the circular dependency between liveSyncRuntime
  // (needs resumePendingOutboundMessages) and outboundRuntime (needs schedulePendingMessageSync).
  let outboundResumeRef: (() => Promise<void>) | null = null;

  const liveSyncRuntime = createMessagesLiveSyncRuntime({
    set,
    get,
    shared,
    syncPendingMessages: historyRuntime.syncPendingMessages,
    resumePendingOutboundMessages: () => outboundResumeRef?.() ?? Promise.resolve(),
  });
  const outboundRuntime = createMessagesOutboundRuntime({
    set,
    get,
    shared,
    schedulePendingMessageSync: liveSyncRuntime.schedulePendingMessageSync,
  });
  outboundResumeRef = outboundRuntime.resumePendingOutboundMessages;
  const inboundRuntime = createMessagesInboundRuntime({
    set,
    get,
    shared,
    schedulePendingMessageSync: liveSyncRuntime.schedulePendingMessageSync,
    trySendReadReceipt: liveSyncRuntime.trySendReadReceipt,
    queueReadReceipt: liveSyncRuntime.queueReadReceipt,
  });

  const baseState = createBaseState();

  return {
    ...baseState,

    setActiveConversation: (userId) => {
      let nextConversations: Record<string, Conversation> | null = null;

      set((state) => {
        if (!userId) {
          return { activeConversationId: null };
        }

        const targetConversation = state.conversations[userId];
        if (!targetConversation || targetConversation.unreadCount === 0) {
          return { activeConversationId: userId };
        }

        nextConversations = {
          ...state.conversations,
          [userId]: {
            ...targetConversation,
            unreadCount: 0,
          },
        };

        return {
          activeConversationId: userId,
          conversations: nextConversations,
        };
      });

      if (nextConversations) {
        void persistConversations(nextConversations);
      }
    },

    fetchUserPresence: async (userId) => {
      if (!userId) return;
      try {
        const presence = await api.get<{
          userId: string;
          online: boolean;
          lastSeenAt?: string;
        }>(`/users/${encodeURIComponent(userId)}/presence`);
        set((state) => ({
          presenceByUser: {
            ...state.presenceByUser,
            [presence.userId]: {
              online: presence.online,
              lastSeenAt: presence.lastSeenAt,
              updatedAt: Date.now(),
            },
          },
        }));
      } catch {
        return;
      }
    },

    sendTypingSignal: (targetUserId, isTyping) => {
      if (!targetUserId || !wsClient.connected) return;
      wsClient.send({
        type: isTyping ? "typing.start" : "typing.stop",
        targetUserId,
      });
    },

    markConversationRead: async (userId) => {
      if (!userId) return;

      const conversation = get().conversations[userId];
      if (!conversation) return;

      const markedReadIds = new Set<string>();
      const pendingReadReceiptIds = new Set<string>();
      for (const message of conversation.messages) {
        if (message.isOwn || message.status === "read") continue;
        if (liveSyncRuntime.trySendReadReceipt(message.id)) {
          markedReadIds.add(message.id);
        } else {
          pendingReadReceiptIds.add(message.id);
        }
      }

      if (
        conversation.unreadCount === 0 &&
        markedReadIds.size === 0 &&
        pendingReadReceiptIds.size === 0
      ) {
        return;
      }

      let nextConversations: Record<string, Conversation> | null = null;
      let nextPendingReadReceiptMessageIds: Set<string> | null = null;
      set((state) => {
        const targetConversation = state.conversations[userId];
        if (!targetConversation) return {};

        let statusChanged = false;
        const nextMessages = targetConversation.messages.map((message) => {
          if (!markedReadIds.has(message.id) || message.status === "read") {
            return message;
          }
          statusChanged = true;
          return {
            ...message,
            status: "read" as const,
          };
        });

        const unreadChanged = targetConversation.unreadCount !== 0;
        const pendingReadReceiptMessageIds = new Set(
          state.pendingReadReceiptMessageIds
        );
        let pendingReadReceiptsChanged = false;
        for (const messageId of markedReadIds) {
          if (pendingReadReceiptMessageIds.delete(messageId)) {
            pendingReadReceiptsChanged = true;
          }
        }
        for (const messageId of pendingReadReceiptIds) {
          if (
            !liveSyncRuntime.hasSentReadReceipt(messageId) &&
            !pendingReadReceiptMessageIds.has(messageId)
          ) {
            pendingReadReceiptMessageIds.add(messageId);
            pendingReadReceiptsChanged = true;
          }
        }
        if (!statusChanged && !unreadChanged && !pendingReadReceiptsChanged) {
          return {};
        }

        nextPendingReadReceiptMessageIds = pendingReadReceiptsChanged
          ? trimMessageIds(pendingReadReceiptMessageIds)
          : null;

        nextConversations = {
          ...state.conversations,
          [userId]: {
            ...targetConversation,
            messages: nextMessages,
            unreadCount: 0,
          },
        };
        return {
          conversations: nextConversations,
          pendingReadReceiptMessageIds:
            nextPendingReadReceiptMessageIds ?? state.pendingReadReceiptMessageIds,
        };
      });

      if (nextConversations) {
        await persistConversations(nextConversations);
      }
      if (nextPendingReadReceiptMessageIds) {
        await persistPendingReadReceiptMessageIds(
          nextPendingReadReceiptMessageIds
        );
      }
    },

    ...outboundRuntime,

    recordCallEvent: ({
      userId,
      username,
      mode,
      direction,
      outcome,
      durationSec,
    }) => {
      if (!userId) return;

      const normalizedUsername = sanitizeDisplayText(username);
      if (
        normalizedUsername &&
        !shouldHydrateUserLabel(normalizedUsername, userId)
      ) {
        primeUserLabelCache(userId, normalizedUsername);
      }

      const myUserId = shared.getMyUserId();
      const myDeviceId = shared.getMyDeviceId();
      const safeDurationSec = Number.isFinite(durationSec)
        ? Math.max(0, Math.floor(durationSec ?? 0))
        : undefined;

      const callMessage: Message = {
        id: `call-${crypto.randomUUID()}`,
        senderId: direction === "outbound" ? myUserId ?? userId : userId,
        senderDeviceId: myDeviceId ?? "call",
        content: "",
        type: "call",
        call: {
          mode,
          direction,
          outcome,
          durationSec:
            safeDurationSec && safeDurationSec > 0 ? safeDurationSec : undefined,
        },
        timestamp: Date.now(),
        status: "read",
        isOwn: direction === "outbound",
      };

      let nextConversations: Record<string, Conversation> | null = null;
      set((state) => {
        const existing = state.conversations[userId];
        const conversation: Conversation = existing ?? {
          userId,
          username:
            normalizedUsername && normalizedUsername.length > 0
              ? normalizedUsername
              : userId,
          messages: [],
          lastMessageAt: 0,
          unreadCount: 0,
        };

        const isActiveConvo = state.activeConversationId === userId;
        const inboundUnread = isActiveConvo ? 0 : conversation.unreadCount + 1;
        const nextConversation: Conversation = {
          ...conversation,
          username:
            normalizedUsername && normalizedUsername.length > 0
              ? normalizedUsername
              : conversation.username,
          messages: [...conversation.messages, callMessage],
          lastMessageAt: callMessage.timestamp,
          unreadCount: direction === "inbound" ? inboundUnread : conversation.unreadCount,
        };

        nextConversations = {
          ...state.conversations,
          [userId]: nextConversation,
        };

        return { conversations: nextConversations };
      });

      if (nextConversations) {
        void persistConversations(nextConversations);
      }

      if (
        !normalizedUsername ||
        shouldHydrateUserLabel(normalizedUsername, userId)
      ) {
        void get().ensureConversationUsername(userId);
      }
    },

    ensureConversationUsername: async (userId, preferredUsername) => {
      if (!userId) return null;

      const normalizedPreferred = sanitizeDisplayText(preferredUsername);
      if (
        normalizedPreferred &&
        !shouldHydrateUserLabel(normalizedPreferred, userId)
      ) {
        primeUserLabelCache(userId, normalizedPreferred);
      }

      const currentLabel = get().conversations[userId]?.username;
      if (!shouldHydrateUserLabel(currentLabel, userId)) {
        primeUserLabelCache(userId, currentLabel);
        return sanitizeDisplayText(currentLabel);
      }

      const resolvedLabel =
        normalizedPreferred &&
        !shouldHydrateUserLabel(normalizedPreferred, userId)
          ? normalizedPreferred
          : await fetchUserLabel(userId);

      if (!resolvedLabel) {
        return sanitizeDisplayText(currentLabel);
      }

      let nextConversations: Record<string, Conversation> | null = null;
      set((state) => {
        const conversation = state.conversations[userId];
        if (!conversation) return {};
        if (
          !shouldHydrateUserLabel(conversation.username, userId) &&
          conversation.username !== resolvedLabel
        ) {
          return {};
        }
        if (conversation.username === resolvedLabel) return {};

        nextConversations = {
          ...state.conversations,
          [userId]: {
            ...conversation,
            username: resolvedLabel,
          },
        };
        return { conversations: nextConversations };
      });

      if (nextConversations) {
        await persistConversations(nextConversations);
      }

      return resolvedLabel;
    },

    upsertConversation: (conversation) => {
      set((state) => {
        const existing = state.conversations[conversation.userId];
        if (existing) return {};
        return {
          conversations: {
            ...state.conversations,
            [conversation.userId]: conversation,
          },
        };
      });
    },

    ensureConversation: (userId, username) => {
      set((state) => {
        if (state.conversations[userId]) return {};
        return {
          conversations: {
            ...state.conversations,
            [userId]: {
              userId,
              username: sanitizeDisplayTextOrFallback(username, userId),
              messages: [],
              lastMessageAt: 0,
              unreadCount: 0,
            },
          },
        };
      });
    },

    loadHistory: historyRuntime.loadHistory,
    ...inboundRuntime,
    startListening: liveSyncRuntime.startListening,

    reset: () => {
      shared.resetRuntimeState();
      set({
        conversations: {},
        activeConversationId: null,
        pendingSessions: new Set(),
        processedMessageIds: new Set(),
        pendingAckMessageIds: new Set(),
        quarantinedMessageIds: new Set(),
        pendingReadReceiptMessageIds: new Set(),
        presenceByUser: {},
        typingByUser: {},
        historyLoaded: false,
      });
    },
  };
});

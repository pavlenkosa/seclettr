import { create } from "zustand";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/websocket";
import { createMessagesConversationRuntime } from "./createMessagesConversationRuntime";
import { createMessagesHistoryRuntime } from "./createMessagesHistoryRuntime";
import { createMessagesInboundRuntime } from "./createMessagesInboundRuntime";
import { createMessagesLiveSyncRuntime } from "./createMessagesLiveSyncRuntime";
import { createMessagesOutboundRuntime } from "./createMessagesOutboundRuntime";
import { createMessagesRuntimeShared } from "./messages-runtime-shared";
import { resetOutboundPersistChain } from "./outbound-queue";
import { resetConversationPersistQueue } from "./conversation-persistence";
import type {
  Conversation,
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
  const conversationRuntime = createMessagesConversationRuntime({
    set,
    get,
    shared,
    liveSyncRuntime,
  });

  const baseState = createBaseState();

  return {
    ...baseState,

    ...conversationRuntime,

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

    sendTypingSignal: (targetUserId, isTyping, chatKind = "e2ee") => {
      if (!targetUserId || !wsClient.connected) return;
      wsClient.send({
        type: isTyping ? "typing.start" : "typing.stop",
        targetUserId,
        chatKind,
      });
    },

    ...outboundRuntime,

    loadHistory: historyRuntime.loadHistory,
    ...inboundRuntime,
    startListening: liveSyncRuntime.startListening,

    reset: () => {
      // Reset module-level serial write chains so in-flight writes from the
      // previous session cannot complete and write to a new session's storage.
      resetOutboundPersistChain();
      resetConversationPersistQueue();
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

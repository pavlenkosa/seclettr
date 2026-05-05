import { wsClient } from "@/lib/websocket";
import { logger } from "@/lib/logger.js";
import {
  persistConversations,
  persistPendingReadReceiptMessageIds,
  trimMessageIds,
} from "./conversation-persistence";
import { replenishOtksIfNeeded } from "./otk-replenishment";
import type {
  Conversation,
  GetMessagesState,
  SetMessagesState,
} from "./messages-store-runtime-types";
import type { MessagesRuntimeShared } from "./messages-runtime-shared";

interface CreateMessagesLiveSyncRuntimeOptions {
  set: SetMessagesState;
  get: GetMessagesState;
  shared: MessagesRuntimeShared;
  syncPendingMessages: () => Promise<void>;
  resumePendingOutboundMessages?: () => Promise<void>;
}

const TYPING_TIMEOUT_MS = 3500;

export function createMessagesLiveSyncRuntime({
  set,
  get,
  shared,
  syncPendingMessages,
  resumePendingOutboundMessages,
}: CreateMessagesLiveSyncRuntimeOptions) {
  function schedulePendingMessageSync(reason: string): void {
    if (shared.runtimeState.scheduledPendingSyncTimer !== null) return;
    shared.runtimeState.scheduledPendingSyncTimer = globalThis.setTimeout(() => {
      shared.runtimeState.scheduledPendingSyncTimer = null;
      syncPendingMessages().catch((error) => {
        logger.warn("[MSG] scheduled pending sync failed", reason, error);
      });
    }, 0) as unknown as number;
  }

  function setTypingState(senderUserId: string, typing: boolean): void {
    set((state) => ({
      typingByUser: {
        ...state.typingByUser,
        [senderUserId]: {
          typing,
          updatedAt: Date.now(),
        },
      },
    }));

    const previousTimeoutId =
      shared.runtimeState.typingTimeoutByUser.get(senderUserId);
    if (previousTimeoutId !== undefined) {
      clearTimeout(previousTimeoutId);
      shared.runtimeState.typingTimeoutByUser.delete(senderUserId);
    }

    if (typing) {
      const timeoutId = globalThis.setTimeout(() => {
        set((state) => ({
          typingByUser: {
            ...state.typingByUser,
            [senderUserId]: {
              typing: false,
              updatedAt: Date.now(),
            },
          },
        }));
        shared.runtimeState.typingTimeoutByUser.delete(senderUserId);
      }, TYPING_TIMEOUT_MS) as unknown as number;
      shared.runtimeState.typingTimeoutByUser.set(senderUserId, timeoutId);
    }
  }

  function trySendReadReceipt(messageId: string): boolean {
    if (!wsClient.connected) return false;
    if (shared.runtimeState.sentReadReceipts.has(messageId)) return true;
    const result = wsClient.send({ type: "message.read", messageId });
    if (result.status !== "sent") {
      return false;
    }
    shared.runtimeState.sentReadReceipts.add(messageId);
    return true;
  }

  function hasSentReadReceipt(messageId: string): boolean {
    return shared.runtimeState.sentReadReceipts.has(messageId);
  }

  async function queueReadReceipt(messageId: string): Promise<void> {
    if (shared.runtimeState.sentReadReceipts.has(messageId)) {
      return;
    }

    let nextPendingReadReceiptMessageIds: Set<string> | null = null;
    set((state) => {
      if (state.pendingReadReceiptMessageIds.has(messageId)) {
        return {};
      }
      nextPendingReadReceiptMessageIds = trimMessageIds(
        new Set([...state.pendingReadReceiptMessageIds, messageId])
      );
      return {
        pendingReadReceiptMessageIds: nextPendingReadReceiptMessageIds,
      };
    });

    if (nextPendingReadReceiptMessageIds) {
      await persistPendingReadReceiptMessageIds(nextPendingReadReceiptMessageIds);
    }
  }

  async function clearQueuedReadReceipts(
    messageIds: Iterable<string>
  ): Promise<void> {
    const ids = [...messageIds];
    if (ids.length === 0) {
      return;
    }

    let nextPendingReadReceiptMessageIds: Set<string> | null = null;
    set((state) => {
      let changed = false;
      const pendingReadReceiptMessageIds = new Set(
        state.pendingReadReceiptMessageIds
      );
      for (const messageId of ids) {
        if (pendingReadReceiptMessageIds.delete(messageId)) {
          changed = true;
        }
      }
      if (!changed) {
        return {};
      }
      nextPendingReadReceiptMessageIds = trimMessageIds(
        pendingReadReceiptMessageIds
      );
      return {
        pendingReadReceiptMessageIds: nextPendingReadReceiptMessageIds,
      };
    });

    if (nextPendingReadReceiptMessageIds) {
      await persistPendingReadReceiptMessageIds(nextPendingReadReceiptMessageIds);
    }
  }

  async function flushPendingReadReceipts(): Promise<void> {
    if (!wsClient.connected) {
      return;
    }

    const flushedMessageIds: string[] = [];
    for (const messageId of get().pendingReadReceiptMessageIds) {
      if (trySendReadReceipt(messageId)) {
        flushedMessageIds.push(messageId);
      }
    }

    if (flushedMessageIds.length > 0) {
      await clearQueuedReadReceipts(flushedMessageIds);
    }
  }

  function schedulePersistConversations(): void {
    if (shared.runtimeState.pendingConversationPersistTimer !== null) {
      clearTimeout(shared.runtimeState.pendingConversationPersistTimer);
    }
    shared.runtimeState.pendingConversationPersistTimer = globalThis.setTimeout(() => {
      shared.runtimeState.pendingConversationPersistTimer = null;
      void persistConversations(get().conversations);
    }, 500) as unknown as number;
  }

  function updateOwnMessageStatus(
    incomingMessageId: string,
    clientMessageId: string | undefined,
    status: "delivered" | "read"
  ): void {
    // O(1) index lookup — falls back to full scan for messages not yet indexed.
    const indexedConversationId =
      shared.runtimeState.ownMessageIndex.get(incomingMessageId) ??
      (clientMessageId
        ? shared.runtimeState.ownMessageIndex.get(clientMessageId)
        : undefined);

    let foundConversationId: string | null = null;
    let didChange = false;

    set((state) => {
      // If we have an index hit, check only that conversation.
      // Otherwise fall back to a full scan (first event for a given message).
      const entries: [string, Conversation][] =
        indexedConversationId && state.conversations[indexedConversationId]
          ? [[indexedConversationId, state.conversations[indexedConversationId]]]
          : (Object.entries(state.conversations) as [string, Conversation][]);

      const conversations = { ...state.conversations };
      let changed = false;

      for (const [conversationId, conversation] of entries) {
        const messageIndex = conversation.messages.findIndex(
          (message) =>
            message.isOwn &&
            (message.id === incomingMessageId ||
              (clientMessageId !== undefined &&
                message.id === clientMessageId))
        );
        if (messageIndex < 0) continue;
        const currentMessage = conversation.messages[messageIndex];
        if (!currentMessage) continue;
        if (currentMessage.status === "read") break;
        if (status === "delivered" && currentMessage.status === "delivered") break;

        changed = true;
        foundConversationId = conversationId;
        conversations[conversationId] = {
          ...conversation,
          messages: conversation.messages.map((message) =>
            message.isOwn &&
            (message.id === incomingMessageId ||
              (clientMessageId !== undefined &&
                message.id === clientMessageId))
              ? { ...message, status }
              : message
          ),
        };
        break; // message IDs are globally unique — stop after first match
      }

      if (!changed) return {};
      didChange = true;
      return { conversations };
    });

    // Lazy-index after scan so future events for this message are O(1).
    if (foundConversationId) {
      shared.runtimeState.ownMessageIndex.set(incomingMessageId, foundConversationId);
      if (clientMessageId) {
        shared.runtimeState.ownMessageIndex.set(clientMessageId, foundConversationId);
      }
    }

    if (didChange) {
      schedulePersistConversations();
    }
  }

  function startListening(): () => void {
    const flushActiveConversationRead = () => {
      const activeConversationId = get().activeConversationId;
      if (!activeConversationId) return;
      get()
        .markConversationRead(activeConversationId)
        .catch(() => null);
    };

    const unsubscribeConnection = wsClient.onConnectionChange((connected) => {
      set({ wsConnected: connected });
      if (connected) {
        flushPendingReadReceipts().catch((error) => {
          logger.warn("[MSG] pending read-receipt flush on reconnect failed", error);
        });
        flushActiveConversationRead();
        resumePendingOutboundMessages?.().catch((error) => {
          logger.warn("[MSG] outbound queue resume on reconnect failed", error);
        });
        shared.inboundTrackingCoordinator
          .flushPendingAcknowledgements(set, get)
          .catch((error) => {
            logger.warn("[MSG] pending ack flush on reconnect failed", error);
          });
        if (get().historyLoaded) {
          syncPendingMessages().catch((error) => {
            logger.warn("[MSG] pending sync on reconnect failed", error);
          });
        } else {
          get()
            .loadHistory()
            .catch((error) => {
              logger.warn("[MSG] history bootstrap on reconnect failed", error);
            });
        }
      }
    });

    const unsubscribeMessages = wsClient.on((message) => {
      if (message.type === "message.new") {
        get().handleIncomingMessage(message).catch(logger.error);
      } else if (message.type === "message.delivered") {
        updateOwnMessageStatus(
          message.messageId,
          message.clientMessageId,
          "delivered"
        );
      } else if (message.type === "message.read") {
        updateOwnMessageStatus(message.messageId, message.clientMessageId, "read");
      } else if (message.type === "typing.start") {
        setTypingState(message.senderUserId, true);
      } else if (message.type === "typing.stop") {
        setTypingState(message.senderUserId, false);
      } else if (message.type === "presence.update") {
        set((state) => ({
          presenceByUser: {
            ...state.presenceByUser,
            [message.userId]: {
              online: message.online,
              lastSeenAt: message.lastSeenAt,
              updatedAt: Date.now(),
            },
          },
        }));
      } else if (message.type === "prekeys.low") {
        replenishOtksIfNeeded(message.remaining).catch(logger.error);
      }
    });

    return () => {
      unsubscribeMessages();
      unsubscribeConnection();
      for (const timeoutId of shared.runtimeState.typingTimeoutByUser.values()) {
        clearTimeout(timeoutId);
      }
      shared.runtimeState.typingTimeoutByUser.clear();
    };
  }

  return {
    hasSentReadReceipt,
    queueReadReceipt,
    schedulePendingMessageSync,
    trySendReadReceipt,
    startListening,
  };
}

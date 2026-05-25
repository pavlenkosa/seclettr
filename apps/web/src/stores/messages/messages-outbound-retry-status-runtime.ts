import { api } from "@/lib/api";
import { persistConversations } from "./conversation-persistence";
import {
  incrementOutboundRetryCount,
  loadAllPendingOutboundItems,
  loadOutboundQueueItem,
  removeOutboundQueueItem,
} from "./outbound-queue";
import {
  MAX_OUTBOUND_RETRIES,
  buildQueuedDirectPayload,
  mergeDirectDeliveries,
  parseDirectDeliveries,
} from "./messages-outbound-direct-helpers";
import type {
  Conversation,
  DirectMessageDeliveryMeta,
  GetMessagesState,
  Message,
  SetMessagesState,
} from "./messages-store-runtime-types";
import type { OutboundQueueItem } from "./outbound-queue";

/**
 * Retry/status runtime for encrypted outbound direct-message delivery.
 *
 * Owns manual retry, reconnect resume, queue quarantine/pruning, and the
 * visible optimistic bubble status patching for queued direct messages.
 * It does not own text/attachment/sender-key send preparation.
 */

export interface MessagesOutboundRetryStatusRuntimeDeps {
  set: SetMessagesState;
  get: GetMessagesState;
  applyQueuedSessionCommits: (item: OutboundQueueItem) => Promise<void>;
  settleAcceptedDirectQueueItem: (
    item: OutboundQueueItem,
    deliveries: DirectMessageDeliveryMeta[] | undefined
  ) => Promise<boolean>;
}

export interface MessagesOutboundRetryStatusRuntime {
  markDirectQueuedMessageStatus: (
    recipientUserId: string,
    clientMessageId: string,
    status: Message["status"],
    directDeliveries?: DirectMessageDeliveryMeta[]
  ) => Promise<void>;
  retryDirectMessage: (
    recipientUserId: string,
    messageId: string
  ) => Promise<void>;
  resumePendingOutboundMessages: () => Promise<void>;
}

export function createMessagesOutboundRetryStatusRuntime(
  deps: MessagesOutboundRetryStatusRuntimeDeps
): MessagesOutboundRetryStatusRuntime {
  const {
    set,
    get,
    applyQueuedSessionCommits,
    settleAcceptedDirectQueueItem,
  } = deps;

  async function markDirectQueuedMessageStatus(
    recipientUserId: string,
    clientMessageId: string,
    status: Message["status"],
    directDeliveries?: DirectMessageDeliveryMeta[]
  ): Promise<void> {
    let nextConversations: Record<string, Conversation> | null = null;
    set((state) => {
      const conversation = state.conversations[recipientUserId];
      if (!conversation) return {};
      const nextConversation = {
        ...conversation,
        messages: conversation.messages.map((message) =>
          message.id === clientMessageId
            ? {
                ...message,
                status,
                directDeliveries: mergeDirectDeliveries(
                  message.directDeliveries,
                  directDeliveries
                ),
              }
            : message
        ),
      };
      nextConversations = {
        ...state.conversations,
        [recipientUserId]: nextConversation,
      };
      return { conversations: nextConversations };
    });
    if (nextConversations) {
      await persistConversations(nextConversations);
    }
  }

  async function quarantineDirectOutboundItem(
    clientMessageId: string
  ): Promise<void> {
    set((state) => ({
      quarantinedMessageIds: new Set([
        ...state.quarantinedMessageIds,
        clientMessageId,
      ]),
    }));
    await removeOutboundQueueItem(clientMessageId);
  }

  async function retryDirectMessage(
    recipientUserId: string,
    messageId: string
  ): Promise<void> {
    const conversation = get().conversations[recipientUserId];
    const bubble = conversation?.messages.find((message) => message.id === messageId);
    if (!bubble || !bubble.isOwn || bubble.status !== "error") return;

    const item = await loadOutboundQueueItem(messageId);
    if (item?.recipientUserId !== recipientUserId) return;
    if (item.messageType === "sender_key_distribution") return;

    const retryCount = await incrementOutboundRetryCount(item.clientMessageId);
    if (retryCount > MAX_OUTBOUND_RETRIES) {
      await quarantineDirectOutboundItem(item.clientMessageId);
      return;
    }

    await markDirectQueuedMessageStatus(
      item.recipientUserId,
      item.clientMessageId,
      "sending"
    );

    try {
      await applyQueuedSessionCommits(item);
      const response = await api.post<unknown>(
        "/messages",
        buildQueuedDirectPayload(item)
      );
      const directDeliveries = parseDirectDeliveries(response);
      const fullyAccepted = await settleAcceptedDirectQueueItem(
        item,
        directDeliveries
      );
      await markDirectQueuedMessageStatus(
        item.recipientUserId,
        item.clientMessageId,
        fullyAccepted ? "sent" : "error",
        directDeliveries
      );
    } catch {
      await markDirectQueuedMessageStatus(
        item.recipientUserId,
        item.clientMessageId,
        "error"
      );
    }
  }

  function isOutboundBubbleAlreadySettled(
    bubble:
      | ReturnType<GetMessagesState>["conversations"][string]["messages"][number]
      | undefined
  ): boolean {
    return (
      bubble?.status === "sent" ||
      bubble?.status === "delivered" ||
      bubble?.status === "read"
    );
  }

  async function resumePendingOutboundMessages(): Promise<void> {
    const items = await loadAllPendingOutboundItems();
    const state = get();

    for (const item of items) {
      const bubble = state.conversations[item.recipientUserId]?.messages.find(
        (message) => message.id === item.clientMessageId
      );
      const requiresVisibleBubble =
        item.messageType !== "sender_key_distribution";

      if (requiresVisibleBubble && !bubble) {
        await removeOutboundQueueItem(item.clientMessageId);
        continue;
      }
      if (isOutboundBubbleAlreadySettled(bubble)) {
        await removeOutboundQueueItem(item.clientMessageId);
        continue;
      }

      const newCount = await incrementOutboundRetryCount(item.clientMessageId);
      if (newCount > MAX_OUTBOUND_RETRIES) {
        await quarantineDirectOutboundItem(item.clientMessageId);
        continue;
      }

      try {
        await applyQueuedSessionCommits(item);
        const response = await api.post<unknown>(
          "/messages",
          buildQueuedDirectPayload(item)
        );
        const directDeliveries = parseDirectDeliveries(response);
        const fullyAccepted = await settleAcceptedDirectQueueItem(
          item,
          directDeliveries
        );

        if (requiresVisibleBubble) {
          await markDirectQueuedMessageStatus(
            item.recipientUserId,
            item.clientMessageId,
            fullyAccepted ? "sent" : "error",
            directDeliveries
          );
        }
      } catch {
        // Keep in queue; retry again on next reconnect.
      }
    }
  }

  return {
    markDirectQueuedMessageStatus,
    retryDirectMessage,
    resumePendingOutboundMessages,
  };
}

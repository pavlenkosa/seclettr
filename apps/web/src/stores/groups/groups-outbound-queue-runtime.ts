import { clearUploadLocalSource } from "@/lib/upload-progress";
import {
  MAX_GROUP_OUTBOUND_RETRIES,
  parseServerMessageTimestamp,
} from "./groups-outbound-helpers";
import {
  incrementGroupOutboundRetryCount,
  loadAllPendingGroupOutboundItems,
  loadGroupOutboundQueueItem,
  removeGroupOutboundQueueItem,
  type GroupOutboundQueueItem,
} from "./group-outbound-queue";
import type {
  GetGroupsState,
  GroupChatMessage,
  SetGroupsState,
} from "./groups-store-runtime-types";
import type { GroupsRuntimeShared } from "./groups-runtime-shared";
import type { SendGroupMessageResponse } from "@seclettr/protocol";

interface CreateGroupsOutboundQueueRuntimeOptions {
  set: SetGroupsState;
  get: GetGroupsState;
  shared: GroupsRuntimeShared;
  pendingGroupOutboundEnvelopes: Map<string, GroupOutboundQueueItem>;
  deliverQueuedGroupOutboundItem: (
    item: GroupOutboundQueueItem
  ) => Promise<SendGroupMessageResponse>;
  getRetryAttachmentUpload: () => (
    groupId: string,
    message: NonNullable<
      ReturnType<GetGroupsState>["groups"][string]
    >["messages"][number]
  ) => Promise<void>;
}

/**
 * Owns queue-backed retry/resume/status settlement for encrypted group sends.
 * Visible text/attachment send flows stay outside this runtime.
 */
export function createGroupsOutboundQueueRuntime({
  set,
  get,
  shared,
  pendingGroupOutboundEnvelopes,
  deliverQueuedGroupOutboundItem,
  getRetryAttachmentUpload,
}: CreateGroupsOutboundQueueRuntimeOptions) {
  function markLocalGroupMessageStatus(
    groupId: string,
    localMessageId: string,
    status: GroupChatMessage["status"]
  ): void {
    set((state) => {
      const currentGroup = state.groups[groupId];
      if (!currentGroup) return {};
      return {
        groups: {
          ...state.groups,
          [groupId]: {
            ...currentGroup,
            messages: currentGroup.messages.map((entry) =>
              entry.id === localMessageId ? { ...entry, status } : entry
            ),
          },
        },
      };
    });
  }

  function ensureQueuedOptimisticMessage(item: GroupOutboundQueueItem): void {
    set((state) => {
      const currentGroup =
        state.groups[item.groupId] ??
        shared.createUnknownGroupChat(item.groupId, { historyLoaded: true });
      const hasMessage = currentGroup.messages.some(
        (message) => message.id === item.localMessageId
      );
      if (hasMessage) {
        return {
          groups: {
            ...state.groups,
            [item.groupId]: {
              ...currentGroup,
              messages: currentGroup.messages.map((message) =>
                message.id === item.localMessageId
                  ? { ...message, status: "sending" as const }
                  : message
              ),
            },
          },
        };
      }

      const restoredMessage = {
        ...item.optimisticMessage,
        status: "sending" as const,
      };
      const nextMessages = [...currentGroup.messages, restoredMessage].sort(
        (left, right) => left.timestamp - right.timestamp
      );
      return {
        groups: {
          ...state.groups,
          [item.groupId]: {
            ...currentGroup,
            messages: nextMessages,
            lastMessageAt: nextMessages.at(-1)?.timestamp ?? currentGroup.lastMessageAt,
          },
        },
      };
    });
  }

  function markQueuedMessageSent(
    item: GroupOutboundQueueItem,
    sentMessage: SendGroupMessageResponse
  ): void {
    set((state) => {
      const currentGroup = state.groups[item.groupId];
      if (!currentGroup) return {};
      const timestamp = parseServerMessageTimestamp(
        sentMessage.createdAt,
        item.optimisticMessage.timestamp
      );
      const nextMessages = currentGroup.messages
        .map((message) =>
          message.id === item.localMessageId
            ? {
                ...message,
                id: sentMessage.serverMessageId,
                timestamp,
                status: "sent" as const,
              }
            : message
        )
        .sort((left, right) => left.timestamp - right.timestamp);
      return {
        groups: {
          ...state.groups,
          [item.groupId]: {
            ...currentGroup,
            messages: nextMessages,
            lastMessageAt: nextMessages.at(-1)?.timestamp ?? currentGroup.lastMessageAt,
          },
        },
      };
    });
  }

  async function resumePendingGroupOutboundMessages(): Promise<void> {
    const items = await loadAllPendingGroupOutboundItems();
    for (const item of items) {
      const group = get().groups[item.groupId];
      const existingMessage = group?.messages.find(
        (message) => message.id === item.localMessageId
      );
      if (
        existingMessage?.status === "sent" ||
        existingMessage?.status === "delivered"
      ) {
        await removeGroupOutboundQueueItem(item.localMessageId);
        pendingGroupOutboundEnvelopes.delete(item.localMessageId);
        continue;
      }

      const newCount = await incrementGroupOutboundRetryCount(item.localMessageId);
      if (newCount > MAX_GROUP_OUTBOUND_RETRIES) {
        ensureQueuedOptimisticMessage({
          ...item,
          optimisticMessage: {
            ...item.optimisticMessage,
            status: "error",
          },
        });
        markLocalGroupMessageStatus(item.groupId, item.localMessageId, "error");
        await removeGroupOutboundQueueItem(item.localMessageId);
        pendingGroupOutboundEnvelopes.delete(item.localMessageId);
        continue;
      }

      pendingGroupOutboundEnvelopes.set(item.localMessageId, item);
      ensureQueuedOptimisticMessage(item);

      try {
        const sentMessage = await deliverQueuedGroupOutboundItem(item);
        markQueuedMessageSent(item, sentMessage);
        pendingGroupOutboundEnvelopes.delete(item.localMessageId);
        await removeGroupOutboundQueueItem(item.localMessageId);
      } catch {
        markLocalGroupMessageStatus(item.groupId, item.localMessageId, "error");
      }
    }
  }

  async function retryFromQueueItem(
    groupId: string,
    messageId: string,
    localMessageId: string,
    queueItem: GroupOutboundQueueItem
  ): Promise<void> {
    pendingGroupOutboundEnvelopes.set(localMessageId, queueItem);
    markLocalGroupMessageStatus(groupId, messageId, "sending");
    try {
      const sentMessage = await deliverQueuedGroupOutboundItem(queueItem);
      markQueuedMessageSent(queueItem, sentMessage);
      pendingGroupOutboundEnvelopes.delete(localMessageId);
      await removeGroupOutboundQueueItem(localMessageId).catch(() => null);
      if (queueItem.messageType === "attachment") {
        clearUploadLocalSource(localMessageId);
      }
    } catch {
      markLocalGroupMessageStatus(groupId, messageId, "error");
    }
  }

  async function retryGroupMessage(groupId: string, messageId: string): Promise<void> {
    const group = get().groups[groupId];
    if (!group) return;
    const message = group.messages.find((entry) => entry.id === messageId);
    if (message?.status !== "error") return;
    if (!message.id.startsWith("local-")) return;
    if (!shared.getMyDeviceId() || !shared.getMyUserId() || !shared.getStorageKey()) {
      return;
    }

    const cachedQueueItem =
      pendingGroupOutboundEnvelopes.get(message.id) ??
      (await loadGroupOutboundQueueItem(message.id));

    if (cachedQueueItem?.groupId === groupId) {
      await retryFromQueueItem(groupId, messageId, message.id, cachedQueueItem);
      return;
    }

    if (message.rawType === "attachment" && message.type === "attachment") {
      await getRetryAttachmentUpload()(groupId, message);
    }
  }

  return {
    markQueuedMessageSent,
    resumePendingGroupOutboundMessages,
    retryGroupMessage,
  };
}

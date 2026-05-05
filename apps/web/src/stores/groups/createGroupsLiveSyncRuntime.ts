import { wsClient } from "@/lib/websocket";
import { logger } from "@/lib/logger.js";
import {
  onSenderKeyDistributionImported,
  type ImportedGroupSenderKeyDistribution,
} from "@/lib/group-sender-key-events";
import {
  fetchGroupDetails,
  formatUnknownGroupName,
  scheduleGroupLabelRefresh,
  toGroupChat,
  toGroupMessageResult,
  toProcessedMessageKey,
  GROUP_UNKNOWN_SENDER_LABEL,
} from "./group-helpers";
import {
  isPendingGroupDecryptItemForDistribution,
  loadAllPendingGroupDecryptItems,
  persistPendingGroupDecryptItem,
  removePendingGroupDecryptItem,
} from "./group-pending-decrypt-queue";
import type {
  GetGroupsState,
  GroupChatMessage,
  GroupsState,
  SetGroupsState,
} from "./groups-store-runtime-types";
import type { GroupsRuntimeShared } from "./groups-runtime-shared";
import type { GroupHistoryMessageEnvelope } from "./types";

interface CreateGroupsLiveSyncRuntimeOptions {
  set: SetGroupsState;
  get: GetGroupsState;
  shared: GroupsRuntimeShared;
  resumePendingGroupOutboundMessages?: () => Promise<void>;
}

async function commitPendingDecryptEnvelope(
  groupId: string,
  messageKey: string,
  envelope: GroupHistoryMessageEnvelope,
  fallbackMessage: GroupChatMessage
): Promise<void> {
  await persistPendingGroupDecryptItem({
    messageKey,
    groupId,
    envelope,
    createdAt: fallbackMessage.timestamp,
    lastReason: "missing_sender_key",
  });
}

export function createGroupsLiveSyncRuntime({
  set,
  get,
  shared,
  resumePendingGroupOutboundMessages,
}: CreateGroupsLiveSyncRuntimeOptions) {
  function commitMappedGroupMessage(
    groupId: string,
    mapped: GroupChatMessage,
    messageKey: string
  ): void {
    set((state) => {
      const currentGroup = state.groups[groupId] ?? shared.createUnknownGroupChat(
        groupId,
        {
          name: formatUnknownGroupName(groupId),
          historyLoaded: true,
        }
      );
      const nextMessages = [
        ...currentGroup.messages.filter((message) => message.id !== mapped.id),
        mapped,
      ].sort((left, right) => left.timestamp - right.timestamp);
      const processed = new Set(state.processedGroupMessageKeys);
      processed.add(messageKey);
      return {
        groups: {
          ...state.groups,
          [groupId]: {
            ...currentGroup,
            messages: nextMessages,
            lastMessageAt:
              nextMessages.at(-1)?.timestamp ?? currentGroup.lastMessageAt,
            unreadCount:
              state.activeGroupId === groupId
                ? 0
                : currentGroup.unreadCount + 1,
          },
        },
        processedGroupMessageKeys:
          shared.trimProcessedGroupMessageKeys(processed),
      };
    });
  }

  async function hydrateGroupMetadataAfterMessage(
    groupId: string,
    mapped: GroupChatMessage
  ): Promise<void> {
    if (!mapped.isOwn && mapped.senderLabel === GROUP_UNKNOWN_SENDER_LABEL) {
      scheduleGroupLabelRefresh(groupId, get().refreshGroup);
    }

    if (!get().groups[groupId]?.members.length) {
      const detail = await fetchGroupDetails(groupId);
      if (detail) {
        set((state) => {
          const group = state.groups[groupId];
          if (!group) return {};
          return {
            groups: {
              ...state.groups,
              [groupId]: toGroupChat(detail, group),
            },
          };
        });
      }
    }
  }

  async function retryPendingGroupDecryptMessages(
    distribution?: ImportedGroupSenderKeyDistribution
  ): Promise<void> {
    const pendingItems = await loadAllPendingGroupDecryptItems();
    const filteredItems = distribution
      ? pendingItems.filter((item) =>
          isPendingGroupDecryptItemForDistribution(item, distribution)
        )
      : pendingItems;
    if (filteredItems.length === 0) return;

    for (const item of filteredItems) {
      if (get().processedGroupMessageKeys.has(item.messageKey)) {
        await removePendingGroupDecryptItem(item.messageKey);
        continue;
      }

      const result = await toGroupMessageResult(
        item.groupId,
        item.envelope,
        shared.getMyDeviceId(),
        shared.getStorageKey(),
        get().groups[item.groupId]?.memberDeviceLabels
      );
      if (!result) continue;
      if (result.kind === "pending") {
        continue;
      }

      commitMappedGroupMessage(item.groupId, result.message, item.messageKey);
      await removePendingGroupDecryptItem(item.messageKey);
      await hydrateGroupMetadataAfterMessage(item.groupId, result.message);
    }
  }

  async function handleIncomingGroupMessage(
    incoming: Parameters<GroupsState["handleIncomingGroupMessage"]>[0]
  ): Promise<void> {
    const groupId = incoming.groupId;
    const myDeviceId = shared.getMyDeviceId();
    const storageKey = shared.getStorageKey();
    const cryptoEpoch = incoming.cryptoEpoch ?? 1;
    const knownCryptoEpoch = get().groups[groupId]?.cryptoEpoch ?? 1;
    if (cryptoEpoch > knownCryptoEpoch) {
      await get().refreshGroup(groupId).catch((error) => {
        logger.warn("[GROUP] refresh before future-epoch message failed", error);
      });
      const refreshedCryptoEpoch = get().groups[groupId]?.cryptoEpoch ?? 1;
      if (cryptoEpoch > refreshedCryptoEpoch) return;
    }
    const envelope = {
      id: `${groupId}:${incoming.senderDeviceId}:${incoming.distributionId}:${incoming.messageId}:${incoming.createdAt}`,
      senderDeviceId: incoming.senderDeviceId,
      distributionId: incoming.distributionId,
      cryptoEpoch,
      chainId: incoming.chainId,
      messageId: incoming.messageId,
      messageType: incoming.messageType,
      ciphertext: incoming.ciphertext,
      signature: incoming.signature,
      createdAt: incoming.createdAt,
      aeadVersion: incoming.aeadVersion === 1 ? 1 : 0,
    } as const;
    const messageKey = toProcessedMessageKey(groupId, envelope);
    if (get().processedGroupMessageKeys.has(messageKey)) return;

    // Own-device echoes: the message is already in state as an optimistic/confirmed
    // entry added by the outbound runtime. Decrypting own sender-key messages via
    // the remote-key path always fails → we'd add a GROUP_MESSAGE_UNREADABLE
    // duplicate. Skip them here; outbound runtime owns own-message state.
    if (myDeviceId !== null && incoming.senderDeviceId === myDeviceId) {
      const processed = new Set(get().processedGroupMessageKeys);
      processed.add(messageKey);
      set({ processedGroupMessageKeys: processed });
      return;
    }

    const mapped = await toGroupMessageResult(
      groupId,
      envelope,
      myDeviceId,
      storageKey,
      get().groups[groupId]?.memberDeviceLabels
    );
    if (!mapped) return;
    if (mapped.kind === "pending") {
      await commitPendingDecryptEnvelope(
        groupId,
        messageKey,
        envelope,
        mapped.fallbackMessage
      );
      return;
    }

    commitMappedGroupMessage(groupId, mapped.message, messageKey);
    await removePendingGroupDecryptItem(messageKey);
    await hydrateGroupMetadataAfterMessage(groupId, mapped.message);
  }

  async function handleMemberAdded(groupId: string): Promise<void> {
    if (get().groups[groupId]) {
      await get().refreshGroup(groupId);
      return;
    }
    const detail = await fetchGroupDetails(groupId);
    if (!detail) return;
    set((state) => {
      if (state.groups[groupId]) return {};
      return {
        groups: {
          ...state.groups,
          [groupId]: toGroupChat(detail),
        },
      };
    });
  }

  async function handleMemberRemoved(
    groupId: string,
    removedUserId: string
  ): Promise<void> {
    const myUserId = shared.getMyUserId();
    if (myUserId && myUserId === removedUserId) {
      set((state) => {
        const nextGroups = { ...state.groups };
        delete nextGroups[groupId];
        return {
          groups: nextGroups,
          activeGroupId:
            state.activeGroupId === groupId ? null : state.activeGroupId,
        };
      });
      return;
    }
    if (get().groups[groupId]) {
      await get().refreshGroup(groupId);
    }
  }

  function startListening(): () => void {
    const unsubscribeConnection = wsClient.onConnectionChange((connected) => {
      if (!connected) return;
      resumePendingGroupOutboundMessages?.().catch((error) => {
        logger.warn("[GROUP] outbound queue resume on reconnect failed", error);
      });
      retryPendingGroupDecryptMessages().catch((error) => {
        logger.warn("[GROUP] pending decrypt retry on reconnect failed", error);
      });
    });

    retryPendingGroupDecryptMessages().catch((error) => {
      logger.warn("[GROUP] pending decrypt retry on startup failed", error);
    });

    const unsubscribeMessages = wsClient.on((message) => {
      if (message.type === "group_message.new") {
        handleIncomingGroupMessage(message).catch((error) => {
          logger.error(
            "[GROUP] unexpected error in handleIncomingGroupMessage",
            error
          );
        });
      }
      if (message.type === "group.member_added") {
        handleMemberAdded(message.groupId).catch((error) => {
          logger.error(
            "[GROUP] unexpected error in handleMemberAdded",
            error
          );
        });
      }
      if (message.type === "group.member_removed") {
        handleMemberRemoved(message.groupId, message.removedUserId).catch((error) => {
          logger.error(
            "[GROUP] unexpected error in handleMemberRemoved",
            error
          );
        });
      }
    });

    const unsubscribeSenderKey = onSenderKeyDistributionImported((distribution) => {
      retryPendingGroupDecryptMessages(distribution).catch((error) => {
        logger.warn("[GROUP] pending decrypt retry after sender-key failed", error);
      });
    });

    return () => {
      unsubscribeConnection();
      unsubscribeMessages();
      unsubscribeSenderKey();
    };
  }

  return {
    handleIncomingGroupMessage,
    startListening,
  };
}

import { wsClient } from "@/lib/websocket";
import { logger } from "@/lib/logger.js";
import {
  fetchGroupDetails,
  formatUnknownGroupName,
  scheduleGroupLabelRefresh,
  toGroupChat,
  toGroupMessage,
  toProcessedMessageKey,
  GROUP_UNKNOWN_SENDER_LABEL,
} from "./group-helpers";
import type {
  GetGroupsState,
  GroupsState,
  SetGroupsState,
} from "./groups-store-runtime-types";
import type { GroupsRuntimeShared } from "./groups-runtime-shared";

interface CreateGroupsLiveSyncRuntimeOptions {
  set: SetGroupsState;
  get: GetGroupsState;
  shared: GroupsRuntimeShared;
}

export function createGroupsLiveSyncRuntime({
  set,
  get,
  shared,
}: CreateGroupsLiveSyncRuntimeOptions) {
  async function handleIncomingGroupMessage(
    incoming: Parameters<GroupsState["handleIncomingGroupMessage"]>[0]
  ): Promise<void> {
    const groupId = incoming.groupId;
    const myDeviceId = shared.getMyDeviceId();
    const storageKey = shared.getStorageKey();
    const envelope = {
      id: `${groupId}:${incoming.senderDeviceId}:${incoming.distributionId}:${incoming.messageId}:${incoming.createdAt}`,
      senderDeviceId: incoming.senderDeviceId,
      distributionId: incoming.distributionId,
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

    const mapped = await toGroupMessage(
      groupId,
      envelope,
      myDeviceId,
      storageKey,
      get().groups[groupId]?.memberDeviceLabels
    );
    if (!mapped) return;

    set((state) => {
      const currentGroup = state.groups[groupId] ?? shared.createUnknownGroupChat(
        groupId,
        {
          name: formatUnknownGroupName(groupId),
          historyLoaded: true,
        }
      );
      const nextMessages = [...currentGroup.messages, mapped].sort(
        (left, right) => left.timestamp - right.timestamp
      );
      const processed = new Set(state.processedGroupMessageKeys);
      processed.add(messageKey);
      return {
        groups: {
          ...state.groups,
          [groupId]: {
            ...currentGroup,
            messages: nextMessages,
            lastMessageAt: mapped.timestamp,
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

  async function handleMemberAdded(groupId: string): Promise<void> {
    if (get().groups[groupId]) return;
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

  function startListening(): () => void {
    return wsClient.on((message) => {
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
    });
  }

  return {
    handleIncomingGroupMessage,
    startListening,
  };
}

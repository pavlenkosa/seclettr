import { api } from "@/lib/api";
import {
  canonicalizeGroupHistoryEnvelope,
  formatUnknownGroupName,
  parseTimestamp,
  scheduleGroupLabelRefresh,
  toGroupMessage,
  toProcessedMessageKey,
  GROUP_UNKNOWN_SENDER_LABEL,
} from "./group-helpers";
import {
  createGroupHistoryReplayContext,
  flushGroupHistoryReplayContext,
} from "@/lib/group-sender-key";
import type {
  GetGroupsState,
  GroupChatMessage,
  SetGroupsState,
} from "./groups-store-runtime-types";
import type { GroupsRuntimeShared } from "./groups-runtime-shared";

interface CreateGroupsHistoryRuntimeOptions {
  set: SetGroupsState;
  get: GetGroupsState;
  shared: GroupsRuntimeShared;
}

export function createGroupsHistoryRuntime({
  set,
  get,
  shared,
}: CreateGroupsHistoryRuntimeOptions) {
  return {
    loadGroupMessages: async (groupId: string) => {
      if (!groupId) return;
      if (get().loadingMessagesByGroup[groupId]) return;
      const existing = get().groups[groupId];
      if (existing?.historyLoaded) return;

      set((state) => ({
        loadingMessagesByGroup: {
          ...state.loadingMessagesByGroup,
          [groupId]: true,
        },
      }));

      try {
        const historyMessages = await api.getGroupHistory(groupId, { limit: 100 });
        const myDeviceId = shared.getMyDeviceId();
        const storageKey = shared.getStorageKey();
        const memberDeviceLabels =
          get().groups[groupId]?.memberDeviceLabels ?? {};
        const normalized = historyMessages
          .map((row) => canonicalizeGroupHistoryEnvelope(row))
          .sort(
            (left, right) =>
              parseTimestamp(left.createdAt) - parseTimestamp(right.createdAt)
          );
        const historyReplay = storageKey
          ? createGroupHistoryReplayContext()
          : undefined;
        const mapped: GroupChatMessage[] = [];
        for (const envelope of normalized) {
          const message = await toGroupMessage(
            groupId,
            envelope,
            myDeviceId,
            storageKey,
            memberDeviceLabels,
            historyReplay
          );
          if (message) {
            mapped.push(message);
          }
        }
        if (storageKey && historyReplay) {
          await flushGroupHistoryReplayContext(storageKey, historyReplay);
        }

        set((state) => {
          const currentGroup =
            state.groups[groupId] ??
            shared.createUnknownGroupChat(groupId, {
              name: formatUnknownGroupName(groupId),
            });
          const pendingLocal = currentGroup.messages.filter(
            (message) =>
              message.id.startsWith("local-") &&
              (message.status === "sending" || message.status === "error")
          );
          const nextMessages = [...mapped, ...pendingLocal].sort(
            (left, right) => left.timestamp - right.timestamp
          );
          const processedKeys = new Set(state.processedGroupMessageKeys);
          for (const envelope of normalized) {
            processedKeys.add(toProcessedMessageKey(groupId, envelope));
          }
          return {
            groups: {
              ...state.groups,
              [groupId]: {
                ...currentGroup,
                messages: nextMessages,
                lastMessageAt:
                  nextMessages.at(-1)?.timestamp ?? currentGroup.lastMessageAt,
                historyLoaded: true,
              },
            },
            processedGroupMessageKeys:
              shared.trimProcessedGroupMessageKeys(processedKeys),
          };
        });

        if (
          mapped.some(
            (message) =>
              !message.isOwn &&
              message.senderLabel === GROUP_UNKNOWN_SENDER_LABEL
          )
        ) {
          scheduleGroupLabelRefresh(groupId, get().refreshGroup);
        }
      } finally {
        set((state) => ({
          loadingMessagesByGroup: {
            ...state.loadingMessagesByGroup,
            [groupId]: false,
          },
        }));
      }
    },
  };
}

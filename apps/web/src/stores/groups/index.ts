import { create } from "zustand";
import { useMessagesStore } from "@/stores/messages";
import { createGroupsAdminRuntime } from "./createGroupsAdminRuntime";
import { createGroupsHistoryRuntime } from "./createGroupsHistoryRuntime";
import { createGroupsLiveSyncRuntime } from "./createGroupsLiveSyncRuntime";
import { createGroupsOutboundRuntime } from "./createGroupsOutboundRuntime";
import { createGroupsRuntimeShared } from "./groups-runtime-shared";
import type {
  GroupChat,
  GroupsState,
} from "./groups-store-runtime-types";

export type { GroupMember, GroupChatMessage, GroupChat } from "./types";

function createBaseState() {
  return {
    groups: {} as Record<string, GroupChat>,
    activeGroupId: null as string | null,
    loadingGroups: false,
    errorGroups: null as string | null,
    loadingMessagesByGroup: {} as Record<string, boolean>,
    processedGroupMessageKeys: new Set<string>(),
  };
}

export const useGroupsStore = create<GroupsState>((set, get) => {
  const shared = createGroupsRuntimeShared();
  const adminRuntime = createGroupsAdminRuntime({ set, get, shared });
  const historyRuntime = createGroupsHistoryRuntime({ set, get, shared });
  const outboundRuntime = createGroupsOutboundRuntime({
    set,
    get,
    shared,
    sendSenderKeyDistribution: (recipientUserId, payload, options) =>
      useMessagesStore.getState().sendSenderKeyDistribution(recipientUserId, payload, options),
  });
  const liveSyncRuntime = createGroupsLiveSyncRuntime({ set, get, shared });

  return {
    ...createBaseState(),

    setActiveGroup: (groupId) => {
      set((state) => {
        if (!groupId) return { activeGroupId: null };
        const target = state.groups[groupId];
        if (!target) return { activeGroupId: groupId };
        if (target.unreadCount === 0) return { activeGroupId: groupId };
        return {
          activeGroupId: groupId,
          groups: {
            ...state.groups,
            [groupId]: {
              ...target,
              unreadCount: 0,
            },
          },
        };
      });
    },

    ...adminRuntime,
    ...historyRuntime,
    ...outboundRuntime,
    ...liveSyncRuntime,

    reset: () => {
      set(createBaseState());
    },
  };
});

import {
  GROUPS_PROTOCOL_VERSION,
  GroupListResponseSchema,
  safeParseVersionedWire,
  type GroupMemberRole,
} from "@seclettr/protocol";
import { api } from "@/lib/api";
import {
  fetchGroupDetails,
  fetchGroupMemberDeviceLabels,
  toGroupChat,
} from "./group-helpers";
import type {
  GetGroupsState,
  GroupChat,
  GroupMember,
  SetGroupsState,
} from "./groups-store-runtime-types";
import type { GroupsRuntimeShared } from "./groups-runtime-shared";

interface CreateGroupsAdminRuntimeOptions {
  set: SetGroupsState;
  get: GetGroupsState;
  shared: GroupsRuntimeShared;
}

export function createGroupsAdminRuntime({
  set,
  get,
  shared,
}: CreateGroupsAdminRuntimeOptions) {
  return {
    loadGroups: async () => {
      if (get().loadingGroups) return;
      set({ loadingGroups: true, errorGroups: null });
      try {
        const rawGroups = await api.get<unknown>("/groups");
        const parsedGroups = safeParseVersionedWire(GroupListResponseSchema, rawGroups, GROUPS_PROTOCOL_VERSION);
        if (!parsedGroups.success) {
          throw new Error("Invalid groups list response from server");
        }
        const { groups } = parsedGroups.data;
        const details = await Promise.all(
          groups.map(async (summary) => {
            const full = await fetchGroupDetails(summary.groupId);
            if (full) {
              const memberDeviceLabels = await fetchGroupMemberDeviceLabels(
                full.groupId,
                full.members
              );
              return {
                ...full,
                memberDeviceLabels,
              };
            }
            return {
              ...summary,
              members: [],
              memberDeviceLabels: {},
            };
          })
        );

        set((state) => {
          const nextGroups = { ...state.groups };
          for (const detail of details) {
            const existing = nextGroups[detail.groupId];
            nextGroups[detail.groupId] = toGroupChat(detail, existing);
          }
          return { groups: nextGroups };
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load groups";
        set({ errorGroups: message });
        throw error;
      } finally {
        set({ loadingGroups: false });
      }
    },

    refreshGroup: async (
      groupId: string,
      options?: { refreshDeviceLabels?: boolean }
    ) => {
      if (!groupId) return;
      const detail = await fetchGroupDetails(groupId);
      if (!detail) return;
      const existing = get().groups[groupId];
      const memberDeviceLabels =
        options?.refreshDeviceLabels === false
          ? existing?.memberDeviceLabels ?? {}
          : await fetchGroupMemberDeviceLabels(detail.groupId, detail.members);
      set((state) => {
        const current = state.groups[groupId];
        return {
          groups: {
            ...state.groups,
            [groupId]: toGroupChat(
              { ...detail, memberDeviceLabels },
              current
            ),
          },
        };
      });
    },

    createGroup: async (name: string, memberUserIds: string[]) => {
      const created = await api.post<GroupChat & { members: GroupMember[] }>(
        "/groups",
        {
          version: GROUPS_PROTOCOL_VERSION,
          name,
          memberUserIds,
        }
      );

      const memberDeviceLabels = await fetchGroupMemberDeviceLabels(
        created.groupId,
        created.members
      );
      const nextGroup = {
        ...toGroupChat({ ...created, memberDeviceLabels }),
        historyLoaded: true,
      } satisfies GroupChat;

      set((state) => ({
        groups: {
          ...state.groups,
          [created.groupId]: nextGroup,
        },
      }));

      return nextGroup;
    },

    addGroupMembers: async (
      groupId: string,
      userIds: string[],
      role?: GroupMemberRole
    ) => {
      const uniqueUserIds = Array.from(new Set(userIds));
      if (!groupId || uniqueUserIds.length === 0) return;
      await api.post<{ ok: boolean }>(`/groups/${encodeURIComponent(groupId)}/members`, {
        version: GROUPS_PROTOCOL_VERSION,
        userIds: uniqueUserIds,
        role,
      });
      await get().refreshGroup(groupId);
    },

    removeGroupMember: async (groupId: string, memberUserId: string) => {
      if (!groupId || !memberUserId) return;
      await api.delete<{ ok: boolean }>(
        `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberUserId)}`
      );
      const myUserId = shared.getMyUserId();
      if (myUserId && myUserId === memberUserId) {
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
      await get().refreshGroup(groupId);
    },

    updateGroupMemberRole: async (
      groupId: string,
      memberUserId: string,
      role: "admin" | "member"
    ) => {
      if (!groupId || !memberUserId) return;
      await api.put<{ ok: boolean }>(
        `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberUserId)}/role`,
        {
          version: GROUPS_PROTOCOL_VERSION,
          role,
        }
      );
      await get().refreshGroup(groupId);
    },
  };
}

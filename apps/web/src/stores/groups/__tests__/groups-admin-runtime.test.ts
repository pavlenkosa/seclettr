import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGroupsAdminRuntime } from "@/stores/groups/createGroupsAdminRuntime";
import type {
  GroupsState,
  GroupChat,
} from "@/stores/groups/groups-store-runtime-types";
import type { GroupsRuntimeShared } from "@/stores/groups/groups-runtime-shared";

const {
  apiGetMock,
  apiPostMock,
  apiPutMock,
  apiDeleteMock,
  fetchGroupDetailsMock,
  fetchGroupMemberDeviceLabelsMock,
  toGroupChatMock,
} = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
  apiPutMock: vi.fn(),
  apiDeleteMock: vi.fn(),
  fetchGroupDetailsMock: vi.fn(),
  fetchGroupMemberDeviceLabelsMock: vi.fn(),
  toGroupChatMock: vi.fn((detail: GroupChat, existing?: GroupChat) => ({
    ...existing,
    ...detail,
    members: detail.members,
    memberDeviceLabels: detail.memberDeviceLabels ?? {},
    messages: existing?.messages ?? [],
    lastMessageAt: existing?.lastMessageAt ?? 0,
    unreadCount: existing?.unreadCount ?? 0,
    historyLoaded: existing?.historyLoaded ?? false,
  })),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: apiGetMock,
    post: apiPostMock,
    put: apiPutMock,
    delete: apiDeleteMock,
  },
}));

vi.mock("@/stores/groups/group-helpers", () => ({
  fetchGroupDetails: fetchGroupDetailsMock,
  fetchGroupMemberDeviceLabels: fetchGroupMemberDeviceLabelsMock,
  toGroupChat: toGroupChatMock,
}));

function createState(overrides: Partial<GroupsState> = {}): GroupsState {
  return {
    groups: {},
    activeGroupId: null,
    loadingGroups: false,
    errorGroups: null,
    loadingMessagesByGroup: {},
    processedGroupMessageKeys: new Set(),
    setActiveGroup: () => {},
    loadGroups: async () => {},
    refreshGroup: async () => {},
    createGroup: async () => {
      throw new Error("not implemented");
    },
    addGroupMembers: async () => {},
    removeGroupMember: async () => {},
    updateGroupMemberRole: async () => {},
    loadGroupMessages: async () => {},
    sendGroupText: async () => {},
    retryGroupMessage: async () => {},
    sendGroupFileAttachment: async () => {},
    sendGroupVoiceNote: async () => {},
    sendGroupVideoNote: async () => {},
    handleIncomingGroupMessage: async () => {},
    startListening: () => () => {},
    reset: () => {},
    ...overrides,
  };
}

describe("createGroupsAdminRuntime", () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiPostMock.mockReset();
    apiPutMock.mockReset();
    apiDeleteMock.mockReset();
    fetchGroupDetailsMock.mockReset();
    fetchGroupMemberDeviceLabelsMock.mockReset();
    toGroupChatMock.mockClear();
  });

  it("marks freshly created groups as history-loaded", async () => {
    let state = createState();
    const setState = (
      partial:
        | Partial<GroupsState>
        | ((current: GroupsState) => Partial<GroupsState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    const createdGroup = {
      groupId: "group-1",
      name: "Team room",
      createdAt: "2026-03-10T10:00:00.000Z",
      members: [
        {
          userId: "me",
          username: "me",
          joinedAt: "2026-03-10T10:00:00.000Z",
          role: "admin" as const,
        },
      ],
    };
    apiPostMock.mockResolvedValue(createdGroup);
    fetchGroupMemberDeviceLabelsMock.mockResolvedValue({
      "device-me": "me",
    });

    const runtime = createGroupsAdminRuntime({
      set: setState,
      get: () => state,
      shared: {
        getMyUserId: () => "me",
      } as unknown as GroupsRuntimeShared,
    });

    const created = await runtime.createGroup("Team room", ["alice"]);

    expect(created.historyLoaded).toBe(true);
    expect(state.groups["group-1"]?.historyLoaded).toBe(true);
    expect(apiPostMock).toHaveBeenCalledWith("/groups", {
      version: 1,
      name: "Team room",
      memberUserIds: ["alice"],
    });
  });

  it("fails createGroup when authoritative member-device labels are unavailable", async () => {
    let state = createState();
    const setState = (
      partial:
        | Partial<GroupsState>
        | ((current: GroupsState) => Partial<GroupsState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    apiPostMock.mockResolvedValue({
      groupId: "group-1",
      name: "Team room",
      createdAt: "2026-03-10T10:00:00.000Z",
      members: [],
    });
    fetchGroupMemberDeviceLabelsMock.mockRejectedValue(
      new Error("Invalid API payload")
    );

    const runtime = createGroupsAdminRuntime({
      set: setState,
      get: () => state,
      shared: {
        getMyUserId: () => "me",
      } as unknown as GroupsRuntimeShared,
    });

    await expect(runtime.createGroup("Team room", ["alice"])).rejects.toThrow(
      "Invalid API payload"
    );
    expect(apiGetMock).not.toHaveBeenCalled();
  });

  it("removes the active group locally when the current user leaves the group", async () => {
    let state = createState({
      activeGroupId: "group-1",
      groups: {
        "group-1": {
          groupId: "group-1",
          name: "Team room",
          createdAt: "2026-03-10T10:00:00.000Z",
          cryptoEpoch: 1,
          members: [],
          memberDeviceLabels: {},
          messages: [],
          lastMessageAt: 0,
          unreadCount: 0,
          historyLoaded: true,
        },
      },
    });
    const setState = (
      partial:
        | Partial<GroupsState>
        | ((current: GroupsState) => Partial<GroupsState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    apiDeleteMock.mockResolvedValue({ ok: true });

    const runtime = createGroupsAdminRuntime({
      set: setState,
      get: () => state,
      shared: {
        getMyUserId: () => "me",
      } as unknown as GroupsRuntimeShared,
    });

    await runtime.removeGroupMember("group-1", "me");

    expect(state.groups["group-1"]).toBeUndefined();
    expect(state.activeGroupId).toBeNull();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGroupsLiveSyncRuntime } from "@/stores/groups/createGroupsLiveSyncRuntime";
import type {
  GroupsState,
  GroupChat,
} from "@/stores/groups/groups-store-runtime-types";
import type { GroupsRuntimeShared } from "@/stores/groups/groups-runtime-shared";

const { listeners, fetchGroupDetailsMock, scheduleGroupLabelRefreshMock, toGroupChatMock, toGroupMessageMock, toProcessedMessageKeyMock } =
  vi.hoisted(() => ({
    listeners: {
      message: null as ((message: unknown) => void) | null,
    },
    fetchGroupDetailsMock: vi.fn(),
    scheduleGroupLabelRefreshMock: vi.fn(),
    toGroupChatMock: vi.fn((detail: GroupChat, existing?: GroupChat) => ({
      ...existing,
      ...detail,
      members: detail.members,
      memberDeviceLabels: detail.memberDeviceLabels ?? existing?.memberDeviceLabels ?? {},
      messages: existing?.messages ?? [],
      lastMessageAt: existing?.lastMessageAt ?? 0,
      unreadCount: existing?.unreadCount ?? 0,
      historyLoaded: existing?.historyLoaded ?? true,
    })),
    toGroupMessageMock: vi.fn(),
    toProcessedMessageKeyMock: vi.fn(
      (groupId: string, envelope: { id: string }) => `${groupId}:${envelope.id}`
    ),
  }));

vi.mock("@/lib/websocket", () => ({
  wsClient: {
    on: (listener: (message: unknown) => void) => {
      listeners.message = listener;
      return () => {
        listeners.message = null;
      };
    },
  },
}));

vi.mock("@/stores/groups/group-helpers", () => ({
  fetchGroupDetails: fetchGroupDetailsMock,
  formatUnknownGroupName: (groupId: string) => `Group ${groupId.slice(0, 8)}`,
  scheduleGroupLabelRefresh: scheduleGroupLabelRefreshMock,
  toGroupChat: toGroupChatMock,
  toGroupMessage: toGroupMessageMock,
  toProcessedMessageKey: toProcessedMessageKeyMock,
  GROUP_UNKNOWN_SENDER_LABEL: "Participant",
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

describe("createGroupsLiveSyncRuntime", () => {
  beforeEach(() => {
    listeners.message = null;
    fetchGroupDetailsMock.mockReset();
    scheduleGroupLabelRefreshMock.mockReset();
    toGroupChatMock.mockClear();
    toGroupMessageMock.mockReset();
    toProcessedMessageKeyMock.mockClear();
  });

  it("ignores duplicate inbound messages based on processed keys", async () => {
    let state = createState({
      processedGroupMessageKeys: new Set(["group-1:group-1:device-peer:distribution:message:10"]),
    });
    const setState = (
      partial:
        | Partial<GroupsState>
        | ((current: GroupsState) => Partial<GroupsState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    const runtime = createGroupsLiveSyncRuntime({
      set: setState,
      get: () => state,
      shared: {
        getMyDeviceId: () => "device-me",
        getStorageKey: () => null,
        createUnknownGroupChat: vi.fn(),
        trimProcessedGroupMessageKeys: (keys: Set<string>) => keys,
      } as unknown as GroupsRuntimeShared,
    });

    await runtime.handleIncomingGroupMessage({
      type: "group_message.new",
      groupId: "group-1",
      senderDeviceId: "device-peer",
      distributionId: "distribution",
      chainId: 1,
      messageId: "message",
      messageType: "text",
      ciphertext: "ciphertext",
      signature: "signature",
      createdAt: "10",
      aeadVersion: 0,
    } as never);

    expect(toGroupMessageMock).not.toHaveBeenCalled();
  });

  it("refreshes group detail when inbound media arrives before roster state", async () => {
    let state = createState({
      groups: {
        "group-1": {
          groupId: "group-1",
          name: "Team room",
          createdAt: "0",
          members: [],
          memberDeviceLabels: {},
          messages: [],
          lastMessageAt: 0,
          unreadCount: 0,
          historyLoaded: true,
        },
      },
      refreshGroup: async () => {},
    });
    const setState = (
      partial:
        | Partial<GroupsState>
        | ((current: GroupsState) => Partial<GroupsState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    toGroupMessageMock.mockResolvedValue({
      id: "msg-1",
      senderDeviceId: "device-peer",
      senderLabel: "Participant",
      content: "hello",
      timestamp: 10,
      status: "delivered",
      isOwn: false,
      rawType: "text",
    });
    fetchGroupDetailsMock.mockResolvedValue({
      groupId: "group-1",
      name: "Team room",
      createdAt: "0",
      members: [
        {
          userId: "alice",
          username: "alice",
          joinedAt: "0",
          role: "member",
        },
      ],
      memberDeviceLabels: {
        "device-peer": "alice",
      },
    });

    const runtime = createGroupsLiveSyncRuntime({
      set: setState,
      get: () => state,
      shared: {
        getMyDeviceId: () => "device-me",
        getStorageKey: () => null,
        createUnknownGroupChat: vi.fn(),
        trimProcessedGroupMessageKeys: (keys: Set<string>) => keys,
      } as unknown as GroupsRuntimeShared,
    });

    await runtime.handleIncomingGroupMessage({
      type: "group_message.new",
      groupId: "group-1",
      senderDeviceId: "device-peer",
      distributionId: "distribution",
      chainId: 1,
      messageId: "message",
      messageType: "text",
      ciphertext: "ciphertext",
      signature: "signature",
      createdAt: "10",
      aeadVersion: 0,
    } as never);

    expect(scheduleGroupLabelRefreshMock).toHaveBeenCalledWith(
      "group-1",
      expect.any(Function)
    );
    expect(fetchGroupDetailsMock).toHaveBeenCalledWith("group-1");
    expect(state.groups["group-1"]?.messages).toHaveLength(1);
    expect(state.groups["group-1"]?.members).toHaveLength(1);
  });

  it("routes websocket group_message.new events into inbound handling", async () => {
    let state = createState();
    const setState = (
      partial:
        | Partial<GroupsState>
        | ((current: GroupsState) => Partial<GroupsState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    toGroupMessageMock.mockResolvedValue({
      id: "msg-1",
      senderDeviceId: "device-peer",
      senderLabel: "@alice",
      content: "hello",
      timestamp: 10,
      status: "delivered",
      isOwn: false,
      rawType: "text",
    });

    const runtime = createGroupsLiveSyncRuntime({
      set: setState,
      get: () => state,
      shared: {
        getMyDeviceId: () => "device-me",
        getStorageKey: () => null,
        createUnknownGroupChat: (groupId: string) => ({
          groupId,
          name: "Unknown",
          createdAt: "0",
          members: [],
          memberDeviceLabels: {},
          messages: [],
          lastMessageAt: 0,
          unreadCount: 0,
          historyLoaded: true,
        }),
        trimProcessedGroupMessageKeys: (keys: Set<string>) => keys,
      } as unknown as GroupsRuntimeShared,
    });

    const stopListening = runtime.startListening();
    listeners.message?.({
      type: "group_message.new",
      groupId: "group-1",
      senderDeviceId: "device-peer",
      distributionId: "distribution",
      chainId: 1,
      messageId: "message",
      messageType: "text",
      ciphertext: "ciphertext",
      signature: "signature",
      createdAt: "10",
      aeadVersion: 0,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.groups["group-1"]?.messages).toHaveLength(1);
    stopListening();
  });
});

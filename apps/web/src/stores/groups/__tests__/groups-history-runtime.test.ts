import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGroupsHistoryRuntime } from "@/stores/groups/createGroupsHistoryRuntime";
import type {
  GroupsState,
} from "@/stores/groups/groups-store-runtime-types";
import type { GroupsRuntimeShared } from "@/stores/groups/groups-runtime-shared";

const {
  apiGetGroupHistoryMock,
  canonicalizeGroupHistoryEnvelopeMock,
  parseTimestampMock,
  scheduleGroupLabelRefreshMock,
  toGroupMessageMock,
  toProcessedMessageKeyMock,
  createGroupHistoryReplayContextMock,
  flushGroupHistoryReplayContextMock,
} = vi.hoisted(() => ({
  apiGetGroupHistoryMock: vi.fn(),
  canonicalizeGroupHistoryEnvelopeMock: vi.fn((row) => row),
  parseTimestampMock: vi.fn((createdAt: string) => Number(createdAt)),
  scheduleGroupLabelRefreshMock: vi.fn(),
  toGroupMessageMock: vi.fn(),
  toProcessedMessageKeyMock: vi.fn(
    (groupId: string, envelope: { id: string }) => `${groupId}:${envelope.id}`
  ),
  createGroupHistoryReplayContextMock: vi.fn(() => ({ replay: true })),
  flushGroupHistoryReplayContextMock: vi.fn(async () => {}),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getGroupHistory: apiGetGroupHistoryMock,
  },
}));

vi.mock("@/stores/groups/group-helpers", () => ({
  canonicalizeGroupHistoryEnvelope: canonicalizeGroupHistoryEnvelopeMock,
  parseTimestamp: parseTimestampMock,
  scheduleGroupLabelRefresh: scheduleGroupLabelRefreshMock,
  toGroupMessage: toGroupMessageMock,
  toProcessedMessageKey: toProcessedMessageKeyMock,
  formatUnknownGroupName: (groupId: string) => `Group ${groupId.slice(0, 8)}`,
  GROUP_UNKNOWN_SENDER_LABEL: "Participant",
}));

vi.mock("@/lib/group-sender-key", () => ({
  createGroupHistoryReplayContext: createGroupHistoryReplayContextMock,
  flushGroupHistoryReplayContext: flushGroupHistoryReplayContextMock,
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

describe("createGroupsHistoryRuntime", () => {
  beforeEach(() => {
    apiGetGroupHistoryMock.mockReset();
    canonicalizeGroupHistoryEnvelopeMock.mockClear();
    parseTimestampMock.mockClear();
    scheduleGroupLabelRefreshMock.mockReset();
    toGroupMessageMock.mockReset();
    toProcessedMessageKeyMock.mockClear();
    createGroupHistoryReplayContextMock.mockReset().mockReturnValue({ replay: true });
    flushGroupHistoryReplayContextMock.mockReset().mockResolvedValue(undefined);
  });

  it("merges replayed history with pending local messages and records processed keys", async () => {
    let state = createState({
      groups: {
        "group-1": {
          groupId: "group-1",
          name: "Team room",
          createdAt: "0",
          members: [],
          memberDeviceLabels: {},
          messages: [
            {
              id: "local-1",
              senderDeviceId: "device-me",
              senderLabel: "You",
              content: "pending",
              timestamp: 5,
              status: "sending",
              isOwn: true,
              rawType: "text",
            },
          ],
          lastMessageAt: 5,
          unreadCount: 0,
          historyLoaded: false,
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

    apiGetGroupHistoryMock.mockResolvedValue([
      { id: "history-2", createdAt: "20" },
      { id: "history-1", createdAt: "10" },
    ]);
    toGroupMessageMock
      .mockResolvedValueOnce({
        id: "history-message-1",
        senderDeviceId: "device-peer",
        senderLabel: "@alice",
        content: "hello",
        timestamp: 10,
        status: "delivered",
        isOwn: false,
        rawType: "text",
      })
      .mockResolvedValueOnce({
        id: "history-message-2",
        senderDeviceId: "device-peer",
        senderLabel: "@alice",
        content: "world",
        timestamp: 20,
        status: "delivered",
        isOwn: false,
        rawType: "text",
      });

    const runtime = createGroupsHistoryRuntime({
      set: setState,
      get: () => state,
      shared: {
        getMyDeviceId: () => "device-me",
        getStorageKey: () => null,
        createUnknownGroupChat: vi.fn(),
        trimProcessedGroupMessageKeys: (keys: Set<string>) => keys,
      } as unknown as GroupsRuntimeShared,
    });

    await runtime.loadGroupMessages("group-1");

    expect(state.groups["group-1"]?.historyLoaded).toBe(true);
    expect(state.groups["group-1"]?.messages.map((message) => message.id)).toEqual([
      "local-1",
      "history-message-1",
      "history-message-2",
    ]);
    expect(state.processedGroupMessageKeys.has("group-1:history-1")).toBe(true);
    expect(state.processedGroupMessageKeys.has("group-1:history-2")).toBe(true);
  });

  it("schedules a label refresh when replayed history contains unknown sender labels", async () => {
    let state = createState({
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

    apiGetGroupHistoryMock.mockResolvedValue([{ id: "history-1", createdAt: "10" }]);
    toGroupMessageMock.mockResolvedValue({
      id: "history-message-1",
      senderDeviceId: "device-peer",
      senderLabel: "Participant",
      content: "unknown",
      timestamp: 10,
      status: "delivered",
      isOwn: false,
      rawType: "text",
    });

    const runtime = createGroupsHistoryRuntime({
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
          historyLoaded: false,
        }),
        trimProcessedGroupMessageKeys: (keys: Set<string>) => keys,
      } as unknown as GroupsRuntimeShared,
    });

    await runtime.loadGroupMessages("group-1");

    expect(scheduleGroupLabelRefreshMock).toHaveBeenCalledWith(
      "group-1",
      expect.any(Function)
    );
  });
});

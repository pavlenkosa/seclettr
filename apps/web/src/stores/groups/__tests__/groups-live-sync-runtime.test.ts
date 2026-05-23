import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGroupsLiveSyncRuntime } from "@/stores/groups/createGroupsLiveSyncRuntime";
import type {
  GroupsState,
  GroupChat,
} from "@/stores/groups/groups-store-runtime-types";
import type { GroupsRuntimeShared } from "@/stores/groups/groups-runtime-shared";

const {
  listeners,
  senderKeyListeners,
  fetchGroupDetailsMock,
  scheduleGroupLabelRefreshMock,
  toGroupChatMock,
  toGroupMessageMock,
  toGroupMessageResultMock,
  toProcessedMessageKeyMock,
  loadAllPendingGroupDecryptItemsMock,
  persistPendingGroupDecryptItemMock,
  removePendingGroupDecryptItemMock,
} =
  vi.hoisted(() => ({
    listeners: {
      message: null as ((message: unknown) => void) | null,
      connection: null as ((connected: boolean) => void) | null,
    },
    senderKeyListeners: new Set<(distribution: unknown) => void>(),
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
    toGroupMessageResultMock: vi.fn(),
    toProcessedMessageKeyMock: vi.fn(
      (groupId: string, envelope: { id: string }) => `${groupId}:${envelope.id}`
    ),
    loadAllPendingGroupDecryptItemsMock: vi.fn(),
    persistPendingGroupDecryptItemMock: vi.fn(),
    removePendingGroupDecryptItemMock: vi.fn(),
  }));

vi.mock("@/lib/websocket", () => ({
  wsClient: {
    on: (listener: (message: unknown) => void) => {
      listeners.message = listener;
      return () => {
        listeners.message = null;
      };
    },
    onConnectionChange: (listener: (connected: boolean) => void) => {
      listeners.connection = listener;
      return () => {
        listeners.connection = null;
      };
    },
  },
}));

vi.mock("@/stores/groups/group-roster-runtime", () => ({
  fetchGroupDetails: fetchGroupDetailsMock,
}));

vi.mock("@/stores/groups/group-display-helpers", () => ({
  formatUnknownGroupName: (groupId: string) => `Group ${groupId.slice(0, 8)}`,
  scheduleGroupLabelRefresh: scheduleGroupLabelRefreshMock,
  toGroupChat: toGroupChatMock,
  GROUP_UNKNOWN_SENDER_LABEL: "Participant",
}));

vi.mock("@/stores/groups/group-message-mapping", () => ({
  toGroupMessage: toGroupMessageMock,
  toGroupMessageResult: toGroupMessageResultMock,
  toProcessedMessageKey: toProcessedMessageKeyMock,
}));

vi.mock("@/stores/groups/group-pending-decrypt-queue", () => ({
  isPendingGroupDecryptItemForDistribution: (item: any, distribution: any) =>
    item.groupId === distribution.groupId &&
    item.envelope.senderDeviceId === distribution.senderDeviceId &&
    item.envelope.distributionId === distribution.distributionId,
  loadAllPendingGroupDecryptItems: loadAllPendingGroupDecryptItemsMock,
  persistPendingGroupDecryptItem: persistPendingGroupDecryptItemMock,
  removePendingGroupDecryptItem: removePendingGroupDecryptItemMock,
}));

vi.mock("@/lib/group-sender-key-events", () => ({
  onSenderKeyDistributionImported: (listener: (distribution: unknown) => void) => {
    senderKeyListeners.add(listener);
    return () => {
      senderKeyListeners.delete(listener);
    };
  },
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
    listeners.connection = null;
    fetchGroupDetailsMock.mockReset();
    scheduleGroupLabelRefreshMock.mockReset();
    toGroupChatMock.mockClear();
    toGroupMessageMock.mockReset();
    toGroupMessageResultMock.mockReset().mockImplementation(async (...args: unknown[]) => {
      const message = await toGroupMessageMock(...args);
      return message ? { kind: "message", message } : null;
    });
    toProcessedMessageKeyMock.mockClear();
    loadAllPendingGroupDecryptItemsMock.mockReset().mockResolvedValue([]);
    persistPendingGroupDecryptItemMock.mockReset().mockResolvedValue(undefined);
    removePendingGroupDecryptItemMock.mockReset().mockResolvedValue(undefined);
    senderKeyListeners.clear();
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
          cryptoEpoch: 1,
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

  it("persists inbound messages that are waiting for a sender-key distribution", async () => {
    let state = createState();
    const setState = (
      partial:
        | Partial<GroupsState>
        | ((current: GroupsState) => Partial<GroupsState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    toGroupMessageResultMock.mockResolvedValue({
      kind: "pending",
      reason: "missing_sender_key",
      fallbackMessage: {
        id: "msg-1",
        senderDeviceId: "device-peer",
        senderLabel: "@alice",
        content: "[encrypted message]",
        timestamp: 10,
        status: "error",
        isOwn: false,
        rawType: "text",
      },
    });

    const runtime = createGroupsLiveSyncRuntime({
      set: setState,
      get: () => state,
      shared: {
        getMyDeviceId: () => "device-me",
        getStorageKey: () => ({} as CryptoKey),
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

    expect(persistPendingGroupDecryptItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "group-1",
        messageKey: "group-1:group-1:device-peer:distribution:message:10",
        lastReason: "missing_sender_key",
      })
    );
    expect(state.processedGroupMessageKeys.size).toBe(0);
    expect(state.groups["group-1"]).toBeUndefined();
  });

  it("refreshes group state before processing a future-epoch message", async () => {
    let state = createState({
      groups: {
        "group-1": {
          groupId: "group-1",
          name: "Team room",
          createdAt: "0",
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
    const refreshGroup = vi.fn(async () => {
      state = {
        ...state,
        groups: {
          ...state.groups,
          "group-1": {
            ...state.groups["group-1"]!,
            cryptoEpoch: 2,
          },
        },
      };
    });
    state = { ...state, refreshGroup };
    toGroupMessageMock.mockResolvedValue({
      id: "msg-epoch-2",
      senderDeviceId: "device-peer",
      senderLabel: "@alice",
      content: "epoch two",
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
        createUnknownGroupChat: vi.fn(),
        trimProcessedGroupMessageKeys: (keys: Set<string>) => keys,
      } as unknown as GroupsRuntimeShared,
    });

    await runtime.handleIncomingGroupMessage({
      type: "group_message.new",
      groupId: "group-1",
      senderDeviceId: "device-peer",
      distributionId: "distribution",
      cryptoEpoch: 2,
      chainId: 1,
      messageId: "message",
      messageType: "text",
      ciphertext: "ciphertext",
      signature: "signature",
      createdAt: "10",
      aeadVersion: 0,
    } as never);

    expect(refreshGroup).toHaveBeenCalledWith("group-1");
    expect(state.groups["group-1"]?.messages[0]?.content).toBe("epoch two");
  });

  it("retries pending group decrypt items after the matching sender-key arrives", async () => {
    let state = createState({
      groups: {
        "group-1": {
          groupId: "group-1",
          name: "Team room",
          createdAt: "0",
          cryptoEpoch: 1,
          members: [{ userId: "alice", username: "alice", joinedAt: "0" }],
          memberDeviceLabels: { "device-peer": "alice" },
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
    const envelope = {
      id: "history-1",
      senderDeviceId: "device-peer",
      distributionId: "distribution",
      chainId: 1,
      messageId: "message",
      messageType: "text",
      ciphertext: "ciphertext",
      signature: "signature",
      createdAt: "10",
      aeadVersion: 0,
    };

    const runtime = createGroupsLiveSyncRuntime({
      set: setState,
      get: () => state,
      shared: {
        getMyDeviceId: () => "device-me",
        getStorageKey: () => ({} as CryptoKey),
        createUnknownGroupChat: vi.fn(),
        trimProcessedGroupMessageKeys: (keys: Set<string>) => keys,
      } as unknown as GroupsRuntimeShared,
    });

    const stopListening = runtime.startListening();
    loadAllPendingGroupDecryptItemsMock.mockResolvedValue([
      {
        messageKey: "group-1:history-1",
        groupId: "group-1",
        envelope,
        createdAt: 10,
        lastReason: "missing_sender_key",
      },
    ]);
    toGroupMessageResultMock.mockResolvedValue({
      kind: "message",
      message: {
        id: "history-1",
        senderDeviceId: "device-peer",
        senderLabel: "@alice",
        content: "recovered",
        timestamp: 10,
        status: "delivered",
        isOwn: false,
        rawType: "text",
      },
    });

    for (const listener of senderKeyListeners) {
      listener({
        groupId: "group-1",
        senderDeviceId: "device-peer",
        distributionId: "distribution",
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(state.groups["group-1"]?.messages).toHaveLength(1);
    expect(state.groups["group-1"]?.messages[0]?.content).toBe("recovered");
    expect(state.processedGroupMessageKeys.has("group-1:history-1")).toBe(true);
    expect(removePendingGroupDecryptItemMock).toHaveBeenCalledWith(
      "group-1:history-1"
    );
    stopListening();
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

  it("resumes queued group outbound envelopes on reconnect", async () => {
    let state = createState();
    const setState = (
      partial:
        | Partial<GroupsState>
        | ((current: GroupsState) => Partial<GroupsState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };
    const resumePendingGroupOutboundMessages = vi.fn(async () => {});

    const runtime = createGroupsLiveSyncRuntime({
      set: setState,
      get: () => state,
      shared: {
        getMyDeviceId: () => "device-me",
        getStorageKey: () => null,
        createUnknownGroupChat: vi.fn(),
        trimProcessedGroupMessageKeys: (keys: Set<string>) => keys,
      } as unknown as GroupsRuntimeShared,
      resumePendingGroupOutboundMessages,
    });

    const stopListening = runtime.startListening();
    listeners.connection?.(true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(resumePendingGroupOutboundMessages).toHaveBeenCalledTimes(1);
    stopListening();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGroupsOutboundRuntime } from "@/stores/groups/createGroupsOutboundRuntime";
import type {
  GroupsState,
  GroupChat,
} from "@/stores/groups/groups-store-runtime-types";
import type { GroupsRuntimeShared } from "@/stores/groups/groups-runtime-shared";

const {
  apiPostMock,
  encryptGroupTextEnvelopeMock,
  ensureSenderKeyDistributedToGroupMembersMock,
  persistGroupOutboundQueueItemMock,
  removeGroupOutboundQueueItemMock,
  loadGroupOutboundQueueItemMock,
  incrementGroupOutboundRetryCountMock,
  loadAllPendingGroupOutboundItemsMock,
} = vi.hoisted(() => ({
  apiPostMock: vi.fn(),
  encryptGroupTextEnvelopeMock: vi.fn(),
  ensureSenderKeyDistributedToGroupMembersMock: vi.fn(),
  persistGroupOutboundQueueItemMock: vi.fn(),
  removeGroupOutboundQueueItemMock: vi.fn(),
  loadGroupOutboundQueueItemMock: vi.fn(),
  incrementGroupOutboundRetryCountMock: vi.fn(),
  loadAllPendingGroupOutboundItemsMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    post: apiPostMock,
  },
}));

vi.mock("@/lib/group-sender-key", () => ({
  encryptGroupTextEnvelope: encryptGroupTextEnvelopeMock,
}));

vi.mock("@/stores/groups/group-helpers", () => ({
  ensureSenderKeyDistributedToGroupMembers:
    ensureSenderKeyDistributedToGroupMembersMock,
  formatSenderLabel: (deviceId: string, isOwn: boolean) =>
    isOwn ? "You" : `@${deviceId}`,
}));

vi.mock("@/stores/groups/group-outbound-queue", () => ({
  persistGroupOutboundQueueItem: persistGroupOutboundQueueItemMock,
  removeGroupOutboundQueueItem: removeGroupOutboundQueueItemMock,
  loadGroupOutboundQueueItem: loadGroupOutboundQueueItemMock,
  incrementGroupOutboundRetryCount: incrementGroupOutboundRetryCountMock,
  loadAllPendingGroupOutboundItems: loadAllPendingGroupOutboundItemsMock,
}));

function createGroup(): GroupChat {
  return {
    groupId: "group-1",
    name: "Team room",
    createdAt: "0",
    members: [
      {
        userId: "me",
        username: "me",
        joinedAt: "0",
        role: "admin",
      },
      {
        userId: "alice",
        username: "alice",
        joinedAt: "0",
        role: "member",
      },
    ],
    memberDeviceLabels: {},
    messages: [],
    lastMessageAt: 0,
    unreadCount: 0,
    historyLoaded: true,
  };
}

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

describe("createGroupsOutboundRuntime", () => {
  beforeEach(() => {
    apiPostMock.mockReset().mockResolvedValue({
      ok: true,
      serverMessageId: "33333333-3333-4333-8333-333333333333",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    encryptGroupTextEnvelopeMock.mockReset().mockResolvedValue({
      groupId: "group-1",
      senderDeviceId: "device-me",
      distributionId: "distribution-1",
      chainId: 1,
      messageId: 1,
      ciphertext: "ciphertext",
      signature: "signature",
      aeadVersion: 1,
    });
    ensureSenderKeyDistributedToGroupMembersMock
      .mockReset()
      .mockResolvedValue({});
    persistGroupOutboundQueueItemMock.mockReset().mockResolvedValue(undefined);
    removeGroupOutboundQueueItemMock.mockReset().mockResolvedValue(undefined);
    loadGroupOutboundQueueItemMock.mockReset().mockResolvedValue(null);
    incrementGroupOutboundRetryCountMock.mockReset().mockResolvedValue(1);
    loadAllPendingGroupOutboundItemsMock.mockReset().mockResolvedValue([]);
  });

  it("sends group text with optimistic insert and marks it sent on success", async () => {
    const refreshGroup = vi.fn(async () => {});
    let state = createState({
      groups: {
        "group-1": createGroup(),
      },
      refreshGroup,
    });
    const setState = (
      partial:
        | Partial<GroupsState>
        | ((current: GroupsState) => Partial<GroupsState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };
    const sendSenderKeyDistribution = vi.fn(async () => ["device-alice"]);

    const runtime = createGroupsOutboundRuntime({
      set: setState,
      get: () => state,
      shared: {
        getMyUserId: () => "me",
        getMyDeviceId: () => "device-me",
        getStorageKey: () => ({}) as CryptoKey,
        createUnknownGroupChat: vi.fn(),
      } as unknown as GroupsRuntimeShared,
      sendSenderKeyDistribution,
    });

    await runtime.sendGroupText("group-1", "hello team");

    expect(refreshGroup).toHaveBeenCalledWith("group-1", {
      refreshDeviceLabels: false,
    });
    expect(ensureSenderKeyDistributedToGroupMembersMock).toHaveBeenCalledWith(
      expect.anything(),
      "group-1",
      "me",
      "device-me",
      expect.any(Array),
      sendSenderKeyDistribution
    );
    expect(apiPostMock).toHaveBeenCalledWith(
      "/groups/group-1/messages",
      expect.objectContaining({
        version: 1,
        groupId: "group-1",
        type: "text",
      })
    );
    expect(state.groups["group-1"]?.messages).toHaveLength(1);
    expect(state.groups["group-1"]?.messages[0]?.status).toBe("sent");
    expect(state.groups["group-1"]?.messages[0]?.id).toBe(
      "33333333-3333-4333-8333-333333333333"
    );
    expect(state.groups["group-1"]?.messages[0]?.id.startsWith("local-")).toBe(false);
    expect(persistGroupOutboundQueueItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "group-1",
        clientMessageId: expect.any(String),
        messageType: "text",
        retryCount: 0,
      })
    );
    expect(removeGroupOutboundQueueItemMock).toHaveBeenCalledWith(
      persistGroupOutboundQueueItemMock.mock.calls[0]?.[0].localMessageId
    );
  });

  it("persists group text queue before POST", async () => {
    const refreshGroup = vi.fn(async () => {});
    let state = createState({
      groups: {
        "group-1": createGroup(),
      },
      refreshGroup,
    });
    const setState = (
      partial:
        | Partial<GroupsState>
        | ((current: GroupsState) => Partial<GroupsState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    let persistedBeforePost = false;
    apiPostMock.mockImplementation(async () => {
      persistedBeforePost = persistGroupOutboundQueueItemMock.mock.calls.length > 0;
      return {
        ok: true,
        serverMessageId: "33333333-3333-4333-8333-333333333333",
        createdAt: "2026-01-01T00:00:00.000Z",
      };
    });

    const runtime = createGroupsOutboundRuntime({
      set: setState,
      get: () => state,
      shared: {
        getMyUserId: () => "me",
        getMyDeviceId: () => "device-me",
        getStorageKey: () => ({}) as CryptoKey,
        createUnknownGroupChat: vi.fn(),
      } as unknown as GroupsRuntimeShared,
      sendSenderKeyDistribution: vi.fn(async () => ["device-alice"]),
    });

    await runtime.sendGroupText("group-1", "durable queue");

    expect(persistedBeforePost).toBe(true);
  });

  it("does not retry messages without a cached encrypted envelope", async () => {
    const refreshGroup = vi.fn(async () => {});
    let state = createState({
      groups: {
        "group-1": {
          ...createGroup(),
          messages: [
            {
              id: "sent-1",
              senderDeviceId: "device-me",
              senderLabel: "You",
              content: "sent",
              timestamp: 1,
              status: "sent",
              isOwn: true,
              rawType: "text",
            },
            {
              id: "local-error-1",
              senderDeviceId: "device-me",
              senderLabel: "You",
              content: "retry me",
              replyTo: {
                id: "11111111-1111-4111-8111-111111111111",
                content: "original reply",
              },
              timestamp: 2,
              status: "error",
              isOwn: true,
              rawType: "text",
            },
            {
              id: "attachment-error-1",
              senderDeviceId: "device-me",
              senderLabel: "You",
              content: "photo.png",
              type: "attachment",
              attachment: {
                attachmentId: "22222222-2222-4222-8222-222222222222",
                key: "key",
                digest: "digest",
                mimeType: "image/png",
                fileName: "photo.png",
                size: 123,
                kind: "file",
              },
              timestamp: 3,
              status: "error",
              isOwn: true,
              rawType: "attachment",
            },
          ],
        },
      },
      refreshGroup,
    });
    const setState = (
      partial:
        | Partial<GroupsState>
        | ((current: GroupsState) => Partial<GroupsState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    const runtime = createGroupsOutboundRuntime({
      set: setState,
      get: () => state,
      shared: {
        getMyUserId: () => "me",
        getMyDeviceId: () => "device-me",
        getStorageKey: () => ({}) as CryptoKey,
        createUnknownGroupChat: vi.fn(),
      } as unknown as GroupsRuntimeShared,
      sendSenderKeyDistribution: vi.fn(async () => ["device-alice"]),
    });

    await runtime.retryGroupMessage("group-1", "sent-1");
    expect(apiPostMock).not.toHaveBeenCalled();

    await runtime.retryGroupMessage("group-1", "attachment-error-1");
    expect(apiPostMock).not.toHaveBeenCalled();

    await runtime.retryGroupMessage("group-1", "local-error-1");

    expect(apiPostMock).not.toHaveBeenCalled();
    expect(encryptGroupTextEnvelopeMock).not.toHaveBeenCalled();
  });

  it("retries group text send once after sender-key conflict (409)", async () => {
    const refreshGroup = vi.fn(async () => {});
    let state = createState({
      groups: {
        "group-1": createGroup(),
      },
      refreshGroup,
    });
    const setState = (
      partial:
        | Partial<GroupsState>
        | ((current: GroupsState) => Partial<GroupsState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    encryptGroupTextEnvelopeMock
      .mockReset()
      .mockResolvedValue({
        groupId: "group-1",
        senderDeviceId: "device-me",
        distributionId: "distribution-1",
        chainId: 1,
        messageId: 7,
        ciphertext: "ciphertext-1",
        signature: "signature-1",
        aeadVersion: 1,
      });

    apiPostMock
      .mockReset()
      .mockRejectedValueOnce(
        Object.assign(
          new Error("group sender-key message id already used with different payload"),
          { status: 409 }
        )
      )
      .mockResolvedValueOnce({
        ok: true,
        serverMessageId: "44444444-4444-4444-8444-444444444444",
        createdAt: "2026-01-01T00:00:00.000Z",
      });

    const runtime = createGroupsOutboundRuntime({
      set: setState,
      get: () => state,
      shared: {
        getMyUserId: () => "me",
        getMyDeviceId: () => "device-me",
        getStorageKey: () => ({}) as CryptoKey,
        createUnknownGroupChat: vi.fn(),
      } as unknown as GroupsRuntimeShared,
      sendSenderKeyDistribution: vi.fn(async () => ["device-alice"]),
    });

    await runtime.sendGroupText("group-1", "conflict-safe");

    expect(apiPostMock).toHaveBeenCalledTimes(2);
    expect(encryptGroupTextEnvelopeMock).toHaveBeenCalledTimes(1);
    expect(apiPostMock.mock.calls[1]?.[1]).toEqual(apiPostMock.mock.calls[0]?.[1]);
    expect(state.groups["group-1"]?.messages[0]?.status).toBe("sent");
    expect(state.groups["group-1"]?.messages[0]?.id).toBe(
      "44444444-4444-4444-8444-444444444444"
    );
  });

  it("manual group text retry reuses the cached encrypted envelope", async () => {
    const refreshGroup = vi.fn(async () => {});
    let state = createState({
      groups: {
        "group-1": createGroup(),
      },
      refreshGroup,
    });
    const setState = (
      partial:
        | Partial<GroupsState>
        | ((current: GroupsState) => Partial<GroupsState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    encryptGroupTextEnvelopeMock.mockResolvedValue({
      groupId: "group-1",
      senderDeviceId: "device-me",
      distributionId: "distribution-1",
      chainId: 1,
      messageId: 9,
      ciphertext: "cached-ciphertext",
      signature: "cached-signature",
      aeadVersion: 1,
    });
    apiPostMock.mockReset().mockRejectedValueOnce(new Error("offline"));

    const runtime = createGroupsOutboundRuntime({
      set: setState,
      get: () => state,
      shared: {
        getMyUserId: () => "me",
        getMyDeviceId: () => "device-me",
        getStorageKey: () => ({}) as CryptoKey,
        createUnknownGroupChat: vi.fn(),
      } as unknown as GroupsRuntimeShared,
      sendSenderKeyDistribution: vi.fn(async () => ["device-alice"]),
    });

    await expect(runtime.sendGroupText("group-1", "retry same envelope")).rejects.toThrow(
      "offline"
    );

    const failedMessage = state.groups["group-1"]?.messages[0];
    const firstPayload = apiPostMock.mock.calls[0]?.[1];
    expect(failedMessage?.status).toBe("error");
    expect(failedMessage?.id.startsWith("local-")).toBe(true);

    apiPostMock.mockReset().mockResolvedValueOnce({
      ok: true,
      serverMessageId: "55555555-5555-4555-8555-555555555555",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    encryptGroupTextEnvelopeMock.mockClear();

    await runtime.retryGroupMessage("group-1", failedMessage?.id ?? "");

    expect(encryptGroupTextEnvelopeMock).not.toHaveBeenCalled();
    expect(apiPostMock).toHaveBeenCalledWith("/groups/group-1/messages", firstPayload);
    expect(state.groups["group-1"]?.messages[0]).toMatchObject({
      id: "55555555-5555-4555-8555-555555555555",
      status: "sent",
    });
  });

  it("resumes persisted group text without re-encrypting after reload", async () => {
    let state = createState({
      groups: {},
    });
    const setState = (
      partial:
        | Partial<GroupsState>
        | ((current: GroupsState) => Partial<GroupsState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };
    const optimisticMessage = {
      id: "local-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      senderDeviceId: "device-me",
      senderLabel: "You",
      content: "restored",
      timestamp: 10,
      status: "error" as const,
      isOwn: true,
      rawType: "text" as const,
    };
    const payload = {
      version: 1 as const,
      clientMessageId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      groupId: "group-1",
      distributionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      chainId: 1,
      messageId: 5,
      ciphertext: "stored-ciphertext",
      signature: "stored-signature",
      type: "text" as const,
      aeadVersion: 1,
    };
    loadAllPendingGroupOutboundItemsMock.mockResolvedValueOnce([
      {
        localMessageId: optimisticMessage.id,
        groupId: "group-1",
        clientMessageId: payload.clientMessageId,
        messageType: "text",
        payload,
        optimisticMessage,
        createdAt: 10,
        retryCount: 0,
      },
    ]);
    apiPostMock.mockReset().mockResolvedValueOnce({
      ok: true,
      serverMessageId: "77777777-7777-4777-8777-777777777777",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const runtime = createGroupsOutboundRuntime({
      set: setState,
      get: () => state,
      shared: {
        getMyUserId: () => "me",
        getMyDeviceId: () => "device-me",
        getStorageKey: () => ({}) as CryptoKey,
        createUnknownGroupChat: vi.fn((groupId: string) => ({
          groupId,
          name: "Unknown",
          createdAt: "0",
          members: [],
          memberDeviceLabels: {},
          messages: [],
          lastMessageAt: 0,
          unreadCount: 0,
          historyLoaded: true,
        })),
      } as unknown as GroupsRuntimeShared,
      sendSenderKeyDistribution: vi.fn(async () => ["device-alice"]),
    });

    await runtime.resumePendingGroupOutboundMessages();

    expect(encryptGroupTextEnvelopeMock).not.toHaveBeenCalled();
    expect(apiPostMock).toHaveBeenCalledWith("/groups/group-1/messages", payload);
    expect(removeGroupOutboundQueueItemMock).toHaveBeenCalledWith(optimisticMessage.id);
    expect(state.groups["group-1"]?.messages[0]).toMatchObject({
      id: "77777777-7777-4777-8777-777777777777",
      status: "sent",
      content: "restored",
    });
  });
});

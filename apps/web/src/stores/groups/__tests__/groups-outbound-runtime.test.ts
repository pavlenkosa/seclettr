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
} = vi.hoisted(() => ({
  apiPostMock: vi.fn(),
  encryptGroupTextEnvelopeMock: vi.fn(),
  ensureSenderKeyDistributedToGroupMembersMock: vi.fn(),
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
      distributionId: "distribution-1",
      chainId: 1,
      messageId: "encrypted-1",
      ciphertext: "ciphertext",
      signature: "signature",
    });
    ensureSenderKeyDistributedToGroupMembersMock
      .mockReset()
      .mockResolvedValue({});
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
  });

  it("retries only messages in error state", async () => {
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

    expect(apiPostMock).toHaveBeenCalledTimes(1);
    expect(encryptGroupTextEnvelopeMock).toHaveBeenCalledWith(
      expect.anything(),
      "group-1",
      "device-me",
      "retry me",
      {
        id: "11111111-1111-4111-8111-111111111111",
        snippet: "original reply",
      }
    );
    expect(
      state.groups["group-1"]?.messages.find((message) =>
        message.id === "33333333-3333-4333-8333-333333333333"
      )
        ?.status
    ).toBe("sent");
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
      .mockResolvedValueOnce({
        distributionId: "distribution-1",
        chainId: 1,
        messageId: "encrypted-1",
        ciphertext: "ciphertext-1",
        signature: "signature-1",
      })
      .mockResolvedValueOnce({
        distributionId: "distribution-1",
        chainId: 1,
        messageId: "encrypted-2",
        ciphertext: "ciphertext-2",
        signature: "signature-2",
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
    expect(encryptGroupTextEnvelopeMock).toHaveBeenCalledTimes(2);
    expect(state.groups["group-1"]?.messages[0]?.status).toBe("sent");
    expect(state.groups["group-1"]?.messages[0]?.id).toBe(
      "44444444-4444-4444-8444-444444444444"
    );
  });
});

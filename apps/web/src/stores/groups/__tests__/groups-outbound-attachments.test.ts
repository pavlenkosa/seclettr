import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGroupsOutboundRuntime } from "@/stores/groups/createGroupsOutboundRuntime";
import type {
  GroupsState,
  GroupChat,
} from "@/stores/groups/groups-store-runtime-types";
import type { GroupsRuntimeShared } from "@/stores/groups/groups-runtime-shared";

const {
  apiPostMock,
  apiUploadMock,
  encryptAttachmentMock,
  uploadFormDataWithProgressMock,
  registerUploadMock,
  updateUploadProgressMock,
  unregisterUploadMock,
  getUploadLocalSourceMock,
  setUploadLocalSourceMock,
  clearUploadLocalSourceMock,
  ensureSenderKeyDistributedToGroupMembersMock,
  encryptGroupAttachmentEnvelopeMock,
  persistGroupOutboundQueueItemMock,
  removeGroupOutboundQueueItemMock,
  loadGroupOutboundQueueItemMock,
  incrementGroupOutboundRetryCountMock,
  loadAllPendingGroupOutboundItemsMock,
} = vi.hoisted(() => ({
  apiPostMock: vi.fn(),
  apiUploadMock: vi.fn(),
  encryptAttachmentMock: vi.fn(),
  uploadFormDataWithProgressMock: vi.fn(),
  registerUploadMock: vi.fn(),
  updateUploadProgressMock: vi.fn(),
  unregisterUploadMock: vi.fn(),
  getUploadLocalSourceMock: vi.fn(),
  setUploadLocalSourceMock: vi.fn(),
  clearUploadLocalSourceMock: vi.fn(),
  ensureSenderKeyDistributedToGroupMembersMock: vi.fn(),
  encryptGroupAttachmentEnvelopeMock: vi.fn(),
  persistGroupOutboundQueueItemMock: vi.fn(),
  removeGroupOutboundQueueItemMock: vi.fn(),
  loadGroupOutboundQueueItemMock: vi.fn(),
  incrementGroupOutboundRetryCountMock: vi.fn(),
  loadAllPendingGroupOutboundItemsMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    post: apiPostMock,
    upload: apiUploadMock,
  },
}));

vi.mock("@/lib/upload-progress", () => ({
  registerUpload: registerUploadMock,
  updateUploadProgress: updateUploadProgressMock,
  unregisterUpload: unregisterUploadMock,
  getUploadLocalSource: getUploadLocalSourceMock,
  setUploadLocalSource: setUploadLocalSourceMock,
  clearUploadLocalSource: clearUploadLocalSourceMock,
  uploadFormDataWithProgress: uploadFormDataWithProgressMock,
}));

vi.mock("@seclettr/crypto", () => ({
  encryptAttachment: encryptAttachmentMock,
  toBase64Url: (value: Uint8Array) => Buffer.from(value).toString("base64url"),
}));

vi.mock("@/lib/group-sender-key", () => ({
  encryptGroupAttachmentEnvelope: encryptGroupAttachmentEnvelopeMock,
  encryptGroupTextEnvelope: vi.fn(),
}));

function mockEncryptedAttachmentEnvelope(
  overrides: Partial<{
    groupId: string;
    senderDeviceId: string;
    distributionId: string;
    chainId: number;
    messageId: number;
    ciphertext: string;
    signature: string;
  }> = {}
) {
  return {
    groupId: "group-1",
    senderDeviceId: "device-me",
    distributionId: "distribution-1",
    chainId: 1,
    messageId: 1,
    ciphertext: "ciphertext",
    signature: "signature",
    aeadVersion: 1,
    ...overrides,
  };
}

vi.mock("@/stores/groups/group-sender-key-distribution", () => ({
  ensureSenderKeyDistributedToGroupMembers:
    ensureSenderKeyDistributedToGroupMembersMock,
}));

vi.mock("@/stores/groups/group-display-helpers", () => ({
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
    cryptoEpoch: 1,
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

describe("createGroupsOutboundRuntime attachment flow", () => {
  beforeEach(() => {
    apiPostMock.mockReset();
    apiUploadMock.mockReset();
    encryptAttachmentMock.mockReset().mockResolvedValue({
      data: new Uint8Array([1, 2, 3]),
      key: new Uint8Array(32).fill(3),
      digest: new Uint8Array(32).fill(4),
    });
    uploadFormDataWithProgressMock.mockReset();
    registerUploadMock.mockReset();
    updateUploadProgressMock.mockReset();
    unregisterUploadMock.mockReset();
    getUploadLocalSourceMock.mockReset().mockReturnValue(null);
    setUploadLocalSourceMock.mockReset();
    clearUploadLocalSourceMock.mockReset();
    ensureSenderKeyDistributedToGroupMembersMock
      .mockReset()
      .mockResolvedValue({});
    encryptGroupAttachmentEnvelopeMock
      .mockReset()
      .mockResolvedValue(mockEncryptedAttachmentEnvelope());
    persistGroupOutboundQueueItemMock.mockReset().mockResolvedValue(undefined);
    removeGroupOutboundQueueItemMock.mockReset().mockResolvedValue(undefined);
    loadGroupOutboundQueueItemMock.mockReset().mockResolvedValue(null);
    incrementGroupOutboundRetryCountMock.mockReset().mockResolvedValue(1);
    loadAllPendingGroupOutboundItemsMock.mockReset().mockResolvedValue([]);
  });

  it("removes the optimistic group attachment when upload is cancelled", async () => {
    let state = createState({
      groups: {
        "group-1": createGroup(),
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

    apiPostMock.mockResolvedValueOnce({
      attachmentId: "11111111-1111-4111-8111-111111111111",
      uploadUrl: "https://upload.invalid",
      fields: {},
    });
    uploadFormDataWithProgressMock.mockRejectedValue(
      new DOMException("Upload cancelled", "AbortError")
    );

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

    const file = new File([new Uint8Array([1, 2, 3])], "photo.png", {
      type: "image/png",
    });

    await expect(
      runtime.sendGroupFileAttachment("group-1", file)
    ).rejects.toMatchObject({
      name: "AbortError",
    });

    expect(state.groups["group-1"]?.messages ?? []).toHaveLength(0);
    expect(unregisterUploadMock).toHaveBeenCalledTimes(1);
    expect(clearUploadLocalSourceMock).toHaveBeenCalledTimes(1);
    expect(apiUploadMock).not.toHaveBeenCalled();
  });

  it("keeps the local group attachment source when upload fails", async () => {
    let state = createState({
      groups: {
        "group-1": createGroup(),
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

    apiPostMock.mockResolvedValueOnce({
      attachmentId: "11111111-1111-4111-8111-111111111111",
      uploadUrl: "https://upload.invalid",
      fields: {},
    });
    uploadFormDataWithProgressMock.mockResolvedValue(false);
    apiUploadMock.mockRejectedValue(new Error("proxy upload failed"));

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

    const file = new File([new Uint8Array([1, 2, 3])], "photo.png", {
      type: "image/png",
    });

    await expect(
      runtime.sendGroupFileAttachment("group-1", file)
    ).rejects.toThrow("proxy upload failed");

    const [message] = state.groups["group-1"]?.messages ?? [];
    expect(message?.status).toBe("error");
    expect(setUploadLocalSourceMock).toHaveBeenCalledWith(message?.id, file);
    expect(clearUploadLocalSourceMock).not.toHaveBeenCalled();
  });

  it("retries a failed local group attachment from its retained source", async () => {
    const refreshGroup = vi.fn(async () => {});
    const localBlob = new File([new Uint8Array([7, 8, 9])], "photo.png", {
      type: "image/png",
    });
    let state = createState({
      groups: {
        "group-1": {
          ...createGroup(),
          messages: [
            {
              id: "local-attachment-error-1",
              senderDeviceId: "device-me",
              senderLabel: "You",
              content: "photo.png",
              type: "attachment",
              attachment: {
                attachmentId: "22222222-2222-4222-8222-222222222222",
                key: "old-key",
                digest: "old-digest",
                mimeType: "image/png",
                fileName: "photo.png",
                size: localBlob.size,
                kind: "file",
                mediaGroupId: "44444444-4444-4444-8444-444444444444",
              },
              timestamp: 10,
              status: "error",
              isOwn: true,
              rawType: "attachment",
            },
          ],
          lastMessageAt: 10,
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

    getUploadLocalSourceMock.mockReturnValue(localBlob);
    apiPostMock.mockImplementation(async (url: string) => {
      if (url === "/attachments/init-upload") {
        return {
          attachmentId: "11111111-1111-4111-8111-111111111111",
          uploadUrl: "https://upload.invalid",
          fields: {},
        };
      }
      return {
        ok: true,
        serverMessageId: "33333333-3333-4333-8333-333333333333",
        createdAt: "2026-01-01T00:00:00.000Z",
      };
    });
    uploadFormDataWithProgressMock.mockResolvedValue(true);

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

    await runtime.retryGroupMessage("group-1", "local-attachment-error-1");

    expect(getUploadLocalSourceMock).toHaveBeenCalledWith("local-attachment-error-1");
    expect(setUploadLocalSourceMock).toHaveBeenCalledWith(
      "local-attachment-error-1",
      localBlob
    );
    expect(uploadFormDataWithProgressMock).toHaveBeenCalled();
    expect(apiPostMock).toHaveBeenCalledWith(
      "/groups/group-1/messages",
      expect.objectContaining({
        type: "attachment",
        attachmentId: "11111111-1111-4111-8111-111111111111",
      })
    );
    expect(refreshGroup).toHaveBeenCalledWith("group-1", {
      refreshDeviceLabels: false,
    });
    expect(ensureSenderKeyDistributedToGroupMembersMock).toHaveBeenCalled();
    expect(clearUploadLocalSourceMock).toHaveBeenCalledWith(
      "local-attachment-error-1"
    );
    expect(state.groups["group-1"]?.messages).toHaveLength(1);
    expect(state.groups["group-1"]?.messages[0]).toMatchObject({
      id: "33333333-3333-4333-8333-333333333333",
      status: "sent",
      type: "attachment",
      attachment: {
        attachmentId: "11111111-1111-4111-8111-111111111111",
        fileName: "photo.png",
        mediaGroupId: "44444444-4444-4444-8444-444444444444",
      },
    });
  });

  it("retries attachment message send once after sender-key conflict (409)", async () => {
    let state = createState({
      groups: {
        "group-1": createGroup(),
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

    const file = new File([new Uint8Array([1, 2, 3])], "photo.png", {
      type: "image/png",
    });

    encryptGroupAttachmentEnvelopeMock
      .mockReset()
      .mockResolvedValue(
        mockEncryptedAttachmentEnvelope({
          messageId: 2,
          ciphertext: "ciphertext-1",
          signature: "signature-1",
        })
      );

    apiPostMock
      .mockResolvedValueOnce({
        attachmentId: "11111111-1111-4111-8111-111111111111",
        uploadUrl: "https://upload.invalid",
        fields: {},
      })
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        Object.assign(
          new Error("group sender-key message id already used with different payload"),
          { status: 409 }
        )
      )
      .mockResolvedValueOnce({
        ok: true,
        serverMessageId: "55555555-5555-4555-8555-555555555555",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    uploadFormDataWithProgressMock.mockResolvedValue(true);

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

    await runtime.sendGroupFileAttachment("group-1", file);

    const groupMessagePosts = apiPostMock.mock.calls.filter(
      ([url]) => url === "/groups/group-1/messages"
    );
    expect(groupMessagePosts).toHaveLength(2);
    expect(encryptGroupAttachmentEnvelopeMock).toHaveBeenCalledTimes(1);
    expect(groupMessagePosts[1]?.[1]).toEqual(groupMessagePosts[0]?.[1]);
    expect(state.groups["group-1"]?.messages[0]).toMatchObject({
      id: "55555555-5555-4555-8555-555555555555",
      status: "sent",
    });
  });

  it("encrypts group media captions inside the attachment payload", async () => {
    let state = createState({
      groups: {
        "group-1": createGroup(),
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

    const file = new File([new Uint8Array([1, 2, 3])], "photo.png", {
      type: "image/png",
    });
    const mediaGroupId = "44444444-4444-4444-8444-444444444444";

    apiPostMock
      .mockResolvedValueOnce({
        attachmentId: "11111111-1111-4111-8111-111111111111",
        uploadUrl: "https://upload.invalid",
        fields: {},
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        ok: true,
        serverMessageId: "55555555-5555-4555-8555-555555555555",
        createdAt: "2026-01-01T00:00:00.000Z",
      });
    uploadFormDataWithProgressMock.mockResolvedValue(true);

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

    await runtime.sendGroupFileAttachment(
      "group-1",
      file,
      mediaGroupId,
      "  group caption  "
    );

    const attachmentPayload = encryptGroupAttachmentEnvelopeMock.mock.calls[0]?.[3];
    expect(attachmentPayload).toMatchObject({
      caption: "group caption",
      fileName: "photo.png",
      mediaGroupId,
    });
    expect(state.groups["group-1"]?.messages[0]).toMatchObject({
      status: "sent",
      content: "group caption",
      attachment: {
        caption: "group caption",
        mediaGroupId,
      },
    });
  });

  it("manual attachment retry reuses the cached encrypted group envelope", async () => {
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

    const file = new File([new Uint8Array([1, 2, 3])], "photo.png", {
      type: "image/png",
    });

    apiPostMock
      .mockResolvedValueOnce({
        attachmentId: "11111111-1111-4111-8111-111111111111",
        uploadUrl: "https://upload.invalid",
        fields: {},
      })
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("message post failed"));
    uploadFormDataWithProgressMock.mockResolvedValue(true);

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

    await expect(runtime.sendGroupFileAttachment("group-1", file)).rejects.toThrow(
      "message post failed"
    );

    const failedMessage = state.groups["group-1"]?.messages[0];
    const groupMessagePosts = apiPostMock.mock.calls.filter(
      ([url]) => url === "/groups/group-1/messages"
    );
    const firstPayload = groupMessagePosts[0]?.[1];
    expect(failedMessage?.status).toBe("error");

    apiPostMock.mockReset().mockResolvedValueOnce({
      ok: true,
      serverMessageId: "66666666-6666-4666-8666-666666666666",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    encryptAttachmentMock.mockClear();
    encryptGroupAttachmentEnvelopeMock.mockClear();
    uploadFormDataWithProgressMock.mockClear();

    await runtime.retryGroupMessage("group-1", failedMessage?.id ?? "");

    expect(encryptAttachmentMock).not.toHaveBeenCalled();
    expect(encryptGroupAttachmentEnvelopeMock).not.toHaveBeenCalled();
    expect(uploadFormDataWithProgressMock).not.toHaveBeenCalled();
    expect(apiPostMock).toHaveBeenCalledWith("/groups/group-1/messages", firstPayload);
    expect(clearUploadLocalSourceMock).toHaveBeenCalledWith(failedMessage?.id);
    expect(state.groups["group-1"]?.messages[0]).toMatchObject({
      id: "66666666-6666-4666-8666-666666666666",
      status: "sent",
      type: "attachment",
    });
  });
});

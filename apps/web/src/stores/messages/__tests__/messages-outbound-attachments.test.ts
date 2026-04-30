import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMessagesOutboundRuntime } from "@/stores/messages/createMessagesOutboundRuntime";
import type { MessagesRuntimeShared } from "@/stores/messages/messages-runtime-shared";
import type { MessagesState } from "@/stores/messages/messages-store-runtime-types";

const {
  apiPostMock,
  apiUploadMock,
  persistConversationsMock,
  ratchetEncryptMock,
  encryptAttachmentMock,
  uploadFormDataWithProgressMock,
  registerUploadMock,
  updateUploadProgressMock,
  unregisterUploadMock,
  setUploadLocalSourceMock,
  clearUploadLocalSourceMock,
  persistOutboundQueueItemMock,
  removeOutboundQueueItemMock,
  loadOutboundQueueItemMock,
  loadAllPendingOutboundItemsMock,
  incrementOutboundRetryCountMock,
} = vi.hoisted(() => ({
  apiPostMock: vi.fn(),
  apiUploadMock: vi.fn(),
  persistConversationsMock: vi.fn(),
  ratchetEncryptMock: vi.fn(),
  encryptAttachmentMock: vi.fn(),
  uploadFormDataWithProgressMock: vi.fn(),
  registerUploadMock: vi.fn(),
  updateUploadProgressMock: vi.fn(),
  unregisterUploadMock: vi.fn(),
  setUploadLocalSourceMock: vi.fn(),
  clearUploadLocalSourceMock: vi.fn(),
  persistOutboundQueueItemMock: vi.fn(),
  removeOutboundQueueItemMock: vi.fn(),
  loadOutboundQueueItemMock: vi.fn(),
  loadAllPendingOutboundItemsMock: vi.fn(),
  incrementOutboundRetryCountMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
      this.name = "ApiError";
    }
  },
  api: {
    post: apiPostMock,
    upload: apiUploadMock,
  },
}));

vi.mock("@/lib/direct-envelope", () => ({
  encodeDirectEnvelope: vi.fn(() => "encoded-envelope"),
}));

vi.mock("@/lib/user-labels", () => ({
  getCachedUserLabel: vi.fn(() => null),
  shouldHydrateUserLabel: vi.fn(() => false),
}));

vi.mock("@/stores/messages/conversation-persistence", () => ({
  persistConversations: persistConversationsMock,
}));

vi.mock("@/stores/messages/outbound-queue", () => ({
  persistOutboundQueueItem: persistOutboundQueueItemMock,
  removeOutboundQueueItem: removeOutboundQueueItemMock,
  loadOutboundQueueItem: loadOutboundQueueItemMock,
  loadAllPendingOutboundItems: loadAllPendingOutboundItemsMock,
  incrementOutboundRetryCount: incrementOutboundRetryCountMock,
}));

vi.mock("@/lib/upload-progress", () => ({
  registerUpload: registerUploadMock,
  updateUploadProgress: updateUploadProgressMock,
  unregisterUpload: unregisterUploadMock,
  setUploadLocalSource: setUploadLocalSourceMock,
  clearUploadLocalSource: clearUploadLocalSourceMock,
  uploadFormDataWithProgress: uploadFormDataWithProgressMock,
}));

vi.mock("@seclettr/crypto", () => ({
  encryptAttachment: encryptAttachmentMock,
  ratchetEncrypt: ratchetEncryptMock,
  toBase64Url: (value: Uint8Array) => Buffer.from(value).toString("base64url"),
}));

function createState(overrides: Partial<MessagesState> = {}): MessagesState {
  return {
    conversations: {},
    activeConversationId: null,
    pendingSessions: new Set(),
    processedMessageIds: new Set(),
    pendingAckMessageIds: new Set(),
    quarantinedMessageIds: new Set(),
    presenceByUser: {},
    typingByUser: {},
    wsConnected: false,
    historyLoaded: false,
    setActiveConversation: () => {},
    fetchUserPresence: async () => {},
    sendTypingSignal: () => {},
    markConversationRead: async () => {},
    sendMessage: async () => {},
    retryDirectMessage: async () => {},
    sendAttachment: async () => {},
    sendVoiceNote: async () => {},
    sendVideoNote: async () => {},
    acceptPeerIdentityChange: async () => {},
    recordCallEvent: () => {},
    ensureConversationUsername: async () => null,
    sendSenderKeyDistribution: async () => [],
    upsertConversation: () => {},
    ensureConversation: () => {},
    loadHistory: async () => {},
    handleIncomingMessage: async () => {},
    startListening: () => () => {},
    reset: () => {},
    ...overrides,
    pendingReadReceiptMessageIds:
      overrides.pendingReadReceiptMessageIds ?? new Set(),
  };
}

function createShared(): MessagesRuntimeShared {
  return {
    recipientDeviceDirectory: {
      ensureDirectRelationship: vi.fn(async () => {}),
      getDeliverableRecipientDevices: vi.fn(async () => [
        {
          deviceId: "device-peer",
          identityKeyPublic: "identity-peer",
        },
      ]),
      invalidateRecipientDeviceCache: vi.fn(),
    },
    messageSessionRuntime: {
      getOrCreateOutboundSession: vi.fn(async () => ({
        state: { label: "session" },
        x3dhHeader: { senderIdentityKey: "identity-self" },
        oneTimePreKeyReservationToken: "token",
        peerIdentityKeyB64: "identity-peer",
      })),
      saveSession: vi.fn(async () => {}),
      clearSession: vi.fn(async () => {}),
    },
    peerIdentityRuntime: {
      cachePeerIdentity: vi.fn(),
      getConversationIdentityAlert: vi.fn(),
      acceptPeerIdentityChange: vi.fn(),
    },
    getMyUserId: () => "user-self",
    getMyDeviceId: () => "device-self",
    assertPeerIdentityContinuity: vi.fn(async () => {}),
    withSessionLock: async (_deviceId: string, fn: () => Promise<unknown>) => fn(),
    commitConversationIdentityUpdate: vi.fn(async () => {}),
    warmPeerTrustStore: vi.fn(async () => {}),
  } as unknown as MessagesRuntimeShared;
}

describe("createMessagesOutboundRuntime attachment flow", () => {
  beforeEach(() => {
    apiPostMock.mockReset();
    apiUploadMock.mockReset();
    persistConversationsMock.mockReset();
    ratchetEncryptMock.mockReset().mockResolvedValue({
      header: { pn: 0, n: 0 },
      ciphertext: new Uint8Array([1, 2, 3]),
    });
    encryptAttachmentMock.mockReset().mockResolvedValue({
      data: new Uint8Array([1, 2, 3]),
      key: new Uint8Array(32).fill(7),
      digest: new Uint8Array(32).fill(9),
    });
    uploadFormDataWithProgressMock.mockReset();
    registerUploadMock.mockReset();
    updateUploadProgressMock.mockReset();
    unregisterUploadMock.mockReset();
    setUploadLocalSourceMock.mockReset();
    clearUploadLocalSourceMock.mockReset();
    persistOutboundQueueItemMock.mockReset().mockResolvedValue(undefined);
    removeOutboundQueueItemMock.mockReset().mockResolvedValue(undefined);
    loadOutboundQueueItemMock.mockReset().mockResolvedValue(null);
    loadAllPendingOutboundItemsMock.mockReset().mockResolvedValue([]);
    incrementOutboundRetryCountMock.mockReset().mockResolvedValue(1);
  });

  it("removes the optimistic attachment when upload is cancelled", async () => {
    let state = createState();
    const setState = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
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

    const runtime = createMessagesOutboundRuntime({
      set: setState,
      get: () => state,
      shared: createShared(),
      schedulePendingMessageSync: vi.fn(),
    });

    const file = new File([new Uint8Array([1, 2, 3])], "photo.png", {
      type: "image/png",
    });

    await expect(runtime.sendAttachment("user-peer", file)).rejects.toMatchObject({
      name: "AbortError",
    });

    expect(state.conversations["user-peer"]?.messages ?? []).toHaveLength(0);
    expect(unregisterUploadMock).toHaveBeenCalledTimes(1);
    expect(clearUploadLocalSourceMock).toHaveBeenCalledTimes(1);
    expect(apiUploadMock).not.toHaveBeenCalled();
  });

  it("falls back to proxy upload after a direct upload network failure", async () => {
    let state = createState();
    const setState = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    apiPostMock
      .mockResolvedValueOnce({
        attachmentId: "11111111-1111-4111-8111-111111111111",
        uploadUrl: "https://upload.invalid",
        fields: {},
      })
      .mockResolvedValueOnce({});
    apiUploadMock.mockResolvedValue(undefined);
    uploadFormDataWithProgressMock.mockRejectedValue(new Error("Upload network error"));

    const runtime = createMessagesOutboundRuntime({
      set: setState,
      get: () => state,
      shared: createShared(),
      schedulePendingMessageSync: vi.fn(),
    });

    const file = new File([new Uint8Array([5, 6, 7])], "photo.png", {
      type: "image/png",
    });

    await runtime.sendAttachment("user-peer", file);

    expect(apiUploadMock).toHaveBeenCalledWith(
      "/attachments/11111111-1111-4111-8111-111111111111/upload-ciphertext",
      expect.any(FormData)
    );
    expect(state.conversations["user-peer"]?.messages).toHaveLength(1);
    expect(state.conversations["user-peer"]?.messages[0]?.status).toBe("sent");
  });

  it("encrypts direct media captions inside the attachment payload", async () => {
    let state = createState();
    const setState = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    apiPostMock
      .mockResolvedValueOnce({
        attachmentId: "11111111-1111-4111-8111-111111111111",
        uploadUrl: "https://upload.invalid",
        fields: {},
      })
      .mockResolvedValueOnce({});
    uploadFormDataWithProgressMock.mockResolvedValue(true);

    const runtime = createMessagesOutboundRuntime({
      set: setState,
      get: () => state,
      shared: createShared(),
      schedulePendingMessageSync: vi.fn(),
    });

    const file = new File([new Uint8Array([5, 6, 7])], "photo.png", {
      type: "image/png",
    });

    await runtime.sendAttachment("user-peer", file, "  payload caption  ");

    const plaintext = JSON.parse(
      new TextDecoder().decode(ratchetEncryptMock.mock.calls[0]?.[1])
    ) as { caption?: string; fileName?: string };

    expect(plaintext.caption).toBe("payload caption");
    expect(plaintext.fileName).toBe("photo.png");
    expect(state.conversations["user-peer"]?.messages[0]?.content).toBe(
      "payload caption"
    );
    expect(state.conversations["user-peer"]?.messages[0]?.attachment?.caption).toBe(
      "payload caption"
    );
  });
});

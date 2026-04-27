import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMessagesOutboundRuntime } from "@/stores/messages/createMessagesOutboundRuntime";
import type { MessagesRuntimeShared } from "@/stores/messages/messages-runtime-shared";
import type { MessagesState } from "@/stores/messages/messages-store-runtime-types";

const {
  apiPostMock,
  persistConversationsMock,
  ratchetEncryptMock,
  persistOutboundQueueItemMock,
  removeOutboundQueueItemMock,
  loadAllPendingOutboundItemsMock,
  incrementOutboundRetryCountMock,
} = vi.hoisted(() => ({
  apiPostMock: vi.fn(),
  persistConversationsMock: vi.fn(),
  ratchetEncryptMock: vi.fn(),
  persistOutboundQueueItemMock: vi.fn(),
  removeOutboundQueueItemMock: vi.fn(),
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
  loadAllPendingOutboundItems: loadAllPendingOutboundItemsMock,
  incrementOutboundRetryCount: incrementOutboundRetryCountMock,
}));

vi.mock("@seclettr/crypto", () => ({
  encryptAttachment: vi.fn(),
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

describe("createMessagesOutboundRuntime", () => {
  beforeEach(() => {
    apiPostMock.mockReset();
    persistConversationsMock.mockReset();
    ratchetEncryptMock.mockReset().mockResolvedValue({
      header: { pn: 0, n: 0 },
      ciphertext: new Uint8Array([1, 2, 3]),
    });
    persistOutboundQueueItemMock.mockReset().mockResolvedValue(undefined);
    removeOutboundQueueItemMock.mockReset().mockResolvedValue(undefined);
    loadAllPendingOutboundItemsMock.mockReset().mockResolvedValue([]);
    incrementOutboundRetryCountMock.mockReset().mockResolvedValue(1);
  });

  it("sends a direct text message with optimistic insert and sent transition", async () => {
    let state = createState();
    const setState = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    apiPostMock.mockResolvedValue({});

    const invalidateRecipientDeviceCache = vi.fn();
    const shared = {
      recipientDeviceDirectory: {
        ensureDirectRelationship: vi.fn(async () => {}),
        getDeliverableRecipientDevices: vi.fn(async () => [
          {
            deviceId: "device-peer",
            identityKeyPublic: "identity-peer",
          },
        ]),
        invalidateRecipientDeviceCache,
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

    const runtime = createMessagesOutboundRuntime({
      set: setState,
      get: () => state,
      shared,
      schedulePendingMessageSync: vi.fn(),
    });

    await runtime.sendMessage("user-peer", "hello world");

    expect(apiPostMock).toHaveBeenCalledWith(
      "/messages",
      expect.objectContaining({
        recipientUserId: "user-peer",
        messages: [
          expect.objectContaining({
            recipientDeviceId: "device-peer",
            type: "text",
          }),
        ],
      })
    );
    expect(state.conversations["user-peer"]?.messages).toHaveLength(1);
    expect(state.conversations["user-peer"]?.messages[0]?.status).toBe("sent");
    expect(invalidateRecipientDeviceCache).not.toHaveBeenCalled();
    expect(persistConversationsMock).toHaveBeenCalled();
  });

  it("marks the optimistic message as error and invalidates cache on 404 send failure", async () => {
    let state = createState();
    const setState = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    const { ApiError } = await import("@/lib/api");
    apiPostMock.mockRejectedValue(new ApiError(404, "recipient not found"));

    const invalidateRecipientDeviceCache = vi.fn();
    const shared = {
      recipientDeviceDirectory: {
        ensureDirectRelationship: vi.fn(async () => {}),
        getDeliverableRecipientDevices: vi.fn(async () => [
          {
            deviceId: "device-peer",
            identityKeyPublic: "identity-peer",
          },
        ]),
        invalidateRecipientDeviceCache,
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

    const runtime = createMessagesOutboundRuntime({
      set: setState,
      get: () => state,
      shared,
      schedulePendingMessageSync: vi.fn(),
    });

    await expect(
      runtime.sendMessage("user-peer", "hello failure")
    ).rejects.toThrow("recipient not found");

    expect(state.conversations["user-peer"]?.messages).toHaveLength(1);
    expect(state.conversations["user-peer"]?.messages[0]?.status).toBe("error");
    expect(invalidateRecipientDeviceCache).toHaveBeenCalledWith("user-peer");
  });

  it("persists outbound queue BEFORE POST and removes it on success", async () => {
    let state = createState();
    const setState = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    let persistCalledBeforePost = false;
    apiPostMock.mockImplementation(async () => {
      persistCalledBeforePost = persistOutboundQueueItemMock.mock.calls.length > 0;
      return {};
    });

    const shared = {
      recipientDeviceDirectory: {
        ensureDirectRelationship: vi.fn(async () => {}),
        getDeliverableRecipientDevices: vi.fn(async () => [
          { deviceId: "device-peer", identityKeyPublic: "identity-peer" },
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

    const runtime = createMessagesOutboundRuntime({
      set: setState,
      get: () => state,
      shared,
      schedulePendingMessageSync: vi.fn(),
    });

    await runtime.sendMessage("user-peer", "queue test");

    expect(persistCalledBeforePost).toBe(true);
    expect(persistOutboundQueueItemMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: "user-peer",
        messageType: "text",
        retryCount: 0,
      })
    );
    // removeOutboundQueueItem is called fire-and-forget; just verify it was invoked.
    await Promise.resolve(); // flush microtasks
    expect(removeOutboundQueueItemMock).toHaveBeenCalled();
  });

  it("keeps queue item when POST fails (no removeOutboundQueueItem)", async () => {
    let state = createState();
    const setState = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    apiPostMock.mockRejectedValue(new Error("network error"));

    const shared = {
      recipientDeviceDirectory: {
        ensureDirectRelationship: vi.fn(async () => {}),
        getDeliverableRecipientDevices: vi.fn(async () => [
          { deviceId: "device-peer", identityKeyPublic: "identity-peer" },
        ]),
        invalidateRecipientDeviceCache: vi.fn(),
      },
      messageSessionRuntime: {
        getOrCreateOutboundSession: vi.fn(async () => ({
          state: { label: "session" },
          x3dhHeader: null,
          oneTimePreKeyReservationToken: null,
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

    const runtime = createMessagesOutboundRuntime({
      set: setState,
      get: () => state,
      shared,
      schedulePendingMessageSync: vi.fn(),
    });

    await expect(runtime.sendMessage("user-peer", "fail message")).rejects.toThrow();

    expect(persistOutboundQueueItemMock).toHaveBeenCalled();
    expect(removeOutboundQueueItemMock).not.toHaveBeenCalled();
  });

  it("resumePendingOutboundMessages retries error messages without re-encrypting", async () => {
    const clientMessageId = "msg-resume-test";
    let state = createState({
      conversations: {
        "user-peer": {
          userId: "user-peer",
          username: "peer",
          messages: [
            {
              id: clientMessageId,
              senderId: "user-self",
              senderDeviceId: "device-self",
              content: "hello",
              type: "text",
              timestamp: Date.now(),
              status: "error",
              isOwn: true,
            },
          ],
          lastMessageAt: Date.now(),
          unreadCount: 0,
        },
      },
    });
    const setState = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    loadAllPendingOutboundItemsMock.mockResolvedValue([
      {
        clientMessageId,
        recipientUserId: "user-peer",
        messageType: "text",
        envelopes: [
          {
            recipientDeviceId: "device-peer",
            ciphertext: "stored-ciphertext",
            type: "text",
          },
        ],
        createdAt: Date.now() - 1000,
        retryCount: 1,
      },
    ]);
    incrementOutboundRetryCountMock.mockResolvedValue(2);
    apiPostMock.mockResolvedValue({});

    const runtime = createMessagesOutboundRuntime({
      set: setState,
      get: () => state,
      shared: {
        recipientDeviceDirectory: { ensureDirectRelationship: vi.fn(), getDeliverableRecipientDevices: vi.fn(), invalidateRecipientDeviceCache: vi.fn() },
        messageSessionRuntime: { getOrCreateOutboundSession: vi.fn(), saveSession: vi.fn(), clearSession: vi.fn(), loadSession: vi.fn() },
        peerIdentityRuntime: { cachePeerIdentity: vi.fn(), getConversationIdentityAlert: vi.fn(), acceptPeerIdentityChange: vi.fn() },
        getMyUserId: () => "user-self",
        getMyDeviceId: () => "device-self",
        assertPeerIdentityContinuity: vi.fn(),
        withSessionLock: async (_: string, fn: () => Promise<unknown>) => fn(),
        commitConversationIdentityUpdate: vi.fn(),
        warmPeerTrustStore: vi.fn(),
      } as unknown as MessagesRuntimeShared,
      schedulePendingMessageSync: vi.fn(),
    });

    await runtime.resumePendingOutboundMessages();

    // Must NOT re-encrypt — ratchetEncrypt should not be called.
    expect(ratchetEncryptMock).not.toHaveBeenCalled();
    // Must POST the stored ciphertext.
    expect(apiPostMock).toHaveBeenCalledWith(
      "/messages",
      expect.objectContaining({
        clientMessageId,
        recipientUserId: "user-peer",
        messages: [expect.objectContaining({ ciphertext: "stored-ciphertext" })],
      })
    );
    expect(state.conversations["user-peer"]?.messages[0]?.status).toBe("sent");
    expect(removeOutboundQueueItemMock).toHaveBeenCalledWith(clientMessageId);
  });

  it("resumePendingOutboundMessages quarantines messages that exceed retry budget", async () => {
    const clientMessageId = "msg-quarantine-test";
    let state = createState({
      conversations: {
        "user-peer": {
          userId: "user-peer",
          username: "peer",
          messages: [
            {
              id: clientMessageId,
              senderId: "user-self",
              senderDeviceId: "device-self",
              content: "stuck",
              type: "text",
              timestamp: Date.now(),
              status: "error",
              isOwn: true,
            },
          ],
          lastMessageAt: Date.now(),
          unreadCount: 0,
        },
      },
    });
    const setState = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    loadAllPendingOutboundItemsMock.mockResolvedValue([
      {
        clientMessageId,
        recipientUserId: "user-peer",
        messageType: "text",
        envelopes: [],
        createdAt: Date.now() - 5000,
        retryCount: 5,
      },
    ]);
    // incrementOutboundRetryCount returns 6 > MAX_OUTBOUND_RETRIES (5)
    incrementOutboundRetryCountMock.mockResolvedValue(6);

    const runtime = createMessagesOutboundRuntime({
      set: setState,
      get: () => state,
      shared: {
        recipientDeviceDirectory: { ensureDirectRelationship: vi.fn(), getDeliverableRecipientDevices: vi.fn(), invalidateRecipientDeviceCache: vi.fn() },
        messageSessionRuntime: { getOrCreateOutboundSession: vi.fn(), saveSession: vi.fn(), clearSession: vi.fn() },
        peerIdentityRuntime: { cachePeerIdentity: vi.fn(), getConversationIdentityAlert: vi.fn(), acceptPeerIdentityChange: vi.fn() },
        getMyUserId: () => "user-self",
        getMyDeviceId: () => "device-self",
        assertPeerIdentityContinuity: vi.fn(),
        withSessionLock: async (_: string, fn: () => Promise<unknown>) => fn(),
        commitConversationIdentityUpdate: vi.fn(),
        warmPeerTrustStore: vi.fn(),
      } as unknown as MessagesRuntimeShared,
      schedulePendingMessageSync: vi.fn(),
    });

    await runtime.resumePendingOutboundMessages();

    expect(apiPostMock).not.toHaveBeenCalled();
    expect(removeOutboundQueueItemMock).toHaveBeenCalledWith(clientMessageId);
    expect(state.quarantinedMessageIds.has(clientMessageId)).toBe(true);
  });

  it("resumePendingOutboundMessages prunes orphaned queue items with no UI bubble", async () => {
    let state = createState();
    const setState = (
      partial:
        | Partial<MessagesState>
        | ((current: MessagesState) => Partial<MessagesState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = { ...state, ...update };
    };

    const orphanId = "orphan-client-id";
    loadAllPendingOutboundItemsMock.mockResolvedValue([
      {
        clientMessageId: orphanId,
        recipientUserId: "user-peer",
        messageType: "text",
        envelopes: [],
        createdAt: Date.now() - 2000,
        retryCount: 0,
      },
    ]);

    const runtime = createMessagesOutboundRuntime({
      set: setState,
      get: () => state,
      shared: {
        recipientDeviceDirectory: { ensureDirectRelationship: vi.fn(), getDeliverableRecipientDevices: vi.fn(), invalidateRecipientDeviceCache: vi.fn() },
        messageSessionRuntime: { getOrCreateOutboundSession: vi.fn(), saveSession: vi.fn(), clearSession: vi.fn() },
        peerIdentityRuntime: { cachePeerIdentity: vi.fn(), getConversationIdentityAlert: vi.fn(), acceptPeerIdentityChange: vi.fn() },
        getMyUserId: () => "user-self",
        getMyDeviceId: () => "device-self",
        assertPeerIdentityContinuity: vi.fn(),
        withSessionLock: async (_: string, fn: () => Promise<unknown>) => fn(),
        commitConversationIdentityUpdate: vi.fn(),
        warmPeerTrustStore: vi.fn(),
      } as unknown as MessagesRuntimeShared,
      schedulePendingMessageSync: vi.fn(),
    });

    await runtime.resumePendingOutboundMessages();

    expect(removeOutboundQueueItemMock).toHaveBeenCalledWith(orphanId);
    expect(apiPostMock).not.toHaveBeenCalled();
  });
});

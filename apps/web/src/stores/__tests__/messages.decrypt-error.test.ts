import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const apiUploadMock = vi.fn();
const wsSendMock = vi.fn();
const decodeDirectEnvelopeMock = vi.fn();
const ratchetDecryptMock = vi.fn();
const loadDecryptedMock = vi.fn();
const importSenderKeyDistributionMock = vi.fn();
const notifySenderKeyDistributionImportedMock = vi.fn();
const postMessageAckMock = vi.fn();

const mockAuthState = {
  userId: "user-self",
  deviceId: "device-self",
  storageKey: {} as CryptoKey,
  identityDhKeyPair: {
    publicKey: new Uint8Array(32).fill(1),
    privateKey: new Uint8Array(32).fill(2),
  },
};

vi.mock("@/lib/api", () => ({
  api: {
    get: apiGetMock,
    post: apiPostMock,
    upload: apiUploadMock,
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
      this.name = "ApiError";
    }
  },
}));

vi.mock("@/lib/websocket", () => ({
  wsClient: {
    connected: false,
    send: wsSendMock,
    on: () => () => {},
    onConnectionChange: () => () => {},
  },
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: {
    getState: () => mockAuthState,
  },
}));

vi.mock("@/lib/user-labels", () => ({
  fetchUserLabel: vi.fn(),
  getCachedUserLabel: vi.fn(() => null),
  primeUserLabelCache: vi.fn(),
  shouldHydrateUserLabel: vi.fn(() => false),
}));

vi.mock("@/lib/group-sender-key", () => ({
  importSenderKeyDistribution: importSenderKeyDistributionMock,
}));

vi.mock("@/lib/group-sender-key-events", () => ({
  notifySenderKeyDistributionImported: notifySenderKeyDistributionImportedMock,
}));

vi.mock("@/lib/direct-envelope", () => ({
  decodeDirectEnvelope: decodeDirectEnvelopeMock,
  encodeDirectEnvelope: vi.fn(() => "encoded-envelope"),
}));

vi.mock("@/lib/message-ack", () => ({
  postMessageAck: postMessageAckMock,
}));

vi.mock("@seclettr/crypto", () => ({
  x3dhSend: vi.fn(),
  initSender: vi.fn(),
  initReceiver: vi.fn(),
  ratchetEncrypt: vi.fn(),
  ratchetDecrypt: ratchetDecryptMock,
  bootstrapReceiverSession: vi.fn(),
  generateKeyPair: vi.fn(),
  generateOneTimePreKeys: vi.fn(),
  encryptAttachment: vi.fn(),
  toBase64Url: (value: Uint8Array) => Buffer.from(value).toString("base64url"),
  fromBase64Url: (value: string) => new Uint8Array(Buffer.from(value, "base64url")),
  storeEncrypted: vi.fn(async () => {}),
  loadDecrypted: loadDecryptedMock,
  restoreKeyPairFromPrivateKey: vi.fn(async (privateKey: Uint8Array, publicKey?: Uint8Array) => ({
    publicKey: publicKey ? new Uint8Array(publicKey) : new Uint8Array(privateKey),
    privateKey,
  })),
  deserializeRatchetState: vi.fn(async (s: any) => {
    const fromB64 = (str: string) => new Uint8Array(Buffer.from(str, "base64url"));
    return {
      DHs: { publicKey: s.DHs_pub ? fromB64(s.DHs_pub) : fromB64(s.DHs_priv), privateKey: fromB64(s.DHs_priv) },
      DHr: s.DHr ? fromB64(s.DHr) : null,
      RK: fromB64(s.RK),
      CKs: s.CKs ? fromB64(s.CKs) : null,
      CKr: s.CKr ? fromB64(s.CKr) : null,
      Ns: s.Ns, Nr: s.Nr, PN: s.PN,
      MKSKIPPED: new Map((s.MKSKIPPED ?? []).map(([k, v]: [string, string]) => [k, fromB64(v)])),
    };
  }),
  serializeRatchetState: vi.fn(),
}));

let useMessagesStore: typeof import("@/stores/messages").useMessagesStore;

const serializedSession = {
  DHs_pub: Buffer.alloc(32, 11).toString("base64url"),
  DHs_priv: Buffer.alloc(32, 12).toString("base64url"),
  DHr: Buffer.alloc(32, 13).toString("base64url"),
  RK: Buffer.alloc(32, 14).toString("base64url"),
  CKs: Buffer.alloc(32, 15).toString("base64url"),
  CKr: Buffer.alloc(32, 16).toString("base64url"),
  Ns: 0,
  Nr: 0,
  PN: 0,
  MKSKIPPED: [] as Array<[string, string]>,
};

describe("message decrypt error surfacing", () => {
  beforeAll(async () => {
    Object.defineProperty(globalThis, "location", {
      value: { protocol: "https:", host: "localhost:5175" },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
      configurable: true,
    });

    ({ useMessagesStore } = await import("@/stores/messages"));
  });

  beforeEach(() => {
    apiGetMock.mockReset();
    apiPostMock.mockReset();
    apiUploadMock.mockReset();
    wsSendMock.mockReset();
    decodeDirectEnvelopeMock.mockReset();
    ratchetDecryptMock.mockReset();
    loadDecryptedMock.mockReset();
    importSenderKeyDistributionMock.mockReset();
    notifySenderKeyDistributionImportedMock.mockReset();
    postMessageAckMock.mockReset();

    apiPostMock.mockResolvedValue({});
    loadDecryptedMock.mockResolvedValue(null);
    postMessageAckMock.mockResolvedValue("acked");

    useMessagesStore.setState({
      conversations: {},
      activeConversationId: null,
      pendingSessions: new Set(),
      processedMessageIds: new Set(),
      pendingAckMessageIds: new Set(),
      quarantinedMessageIds: new Set(),
      presenceByUser: {},
      typingByUser: {},
    });
  });

  it("quarantines malformed payloads and only acks after terminal commit", async () => {
    decodeDirectEnvelopeMock.mockImplementation(() => {
      throw new Error("bad envelope");
    });

    await useMessagesStore.getState().handleIncomingMessage({
      type: "message.new",
      message: {
        id: "msg-corrupt",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
        recipientDeviceId: mockAuthState.deviceId,
        type: "text",
        ciphertext: "broken",
        createdAt: new Date().toISOString(),
      },
    } as never);

    const conversation = useMessagesStore.getState().conversations["user-peer"];
    expect(conversation).toBeDefined();
    expect(conversation?.messages.at(-1)).toMatchObject({
      id: "msg-corrupt",
      status: "error",
      errorKind: "corrupted_payload",
      content: "[corrupted encrypted message]",
      isOwn: false,
    });
    expect(useMessagesStore.getState().quarantinedMessageIds.has("msg-corrupt")).toBe(true);
    expect(useMessagesStore.getState().processedMessageIds.has("msg-corrupt")).toBe(true);
    expect(useMessagesStore.getState().pendingAckMessageIds.has("msg-corrupt")).toBe(false);
    expect(postMessageAckMock).toHaveBeenCalledWith("msg-corrupt");
  });

  it("keeps session-missing failures retryable and unacked", async () => {
    decodeDirectEnvelopeMock.mockReturnValue({
      header: { dh: new Uint8Array(32).fill(3), pn: 0, n: 0 },
      ciphertext: new Uint8Array([1, 2, 3]),
    });
    loadDecryptedMock.mockResolvedValue(null);

    await useMessagesStore.getState().handleIncomingMessage({
      type: "message.new",
      message: {
        id: "msg-session-missing",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
        recipientDeviceId: mockAuthState.deviceId,
        type: "text",
        ciphertext: "valid-envelope",
        createdAt: new Date().toISOString(),
      },
    } as never);

    const conversation = useMessagesStore.getState().conversations["user-peer"];
    expect(conversation?.messages.at(-1)).toMatchObject({
      id: "msg-session-missing",
      status: "error",
      errorKind: "session_missing",
      content: "[message requires session resync]",
    });
    expect(useMessagesStore.getState().processedMessageIds.has("msg-session-missing")).toBe(false);
    expect(useMessagesStore.getState().quarantinedMessageIds.has("msg-session-missing")).toBe(false);
    expect(postMessageAckMock).not.toHaveBeenCalled();
  });

  it("keeps decrypt failures retryable and unacked", async () => {
    decodeDirectEnvelopeMock.mockReturnValue({
      header: { dh: new Uint8Array(32).fill(5), pn: 0, n: 0 },
      ciphertext: new Uint8Array([9, 9, 9]),
    });
    loadDecryptedMock.mockImplementation(async <T,>(_: CryptoKey, key: string): Promise<T | null> => {
      if (key === "session:device-peer") {
        return serializedSession as T;
      }
      return null;
    });
    ratchetDecryptMock.mockRejectedValue(new Error("decrypt failed"));

    await useMessagesStore.getState().handleIncomingMessage({
      type: "message.new",
      message: {
        id: "msg-decrypt-failed",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
        recipientDeviceId: mockAuthState.deviceId,
        type: "text",
        ciphertext: "valid-envelope",
        createdAt: new Date().toISOString(),
      },
    } as never);

    const conversation = useMessagesStore.getState().conversations["user-peer"];
    expect(conversation?.messages.at(-1)).toMatchObject({
      id: "msg-decrypt-failed",
      status: "error",
      errorKind: "decrypt_failed",
      content: "[unable to decrypt message]",
    });
    expect(useMessagesStore.getState().processedMessageIds.has("msg-decrypt-failed")).toBe(false);
    expect(useMessagesStore.getState().quarantinedMessageIds.has("msg-decrypt-failed")).toBe(false);
    expect(postMessageAckMock).not.toHaveBeenCalled();
  });

  it("retries a session-missing message and replaces the placeholder after recovery", async () => {
    const incoming = {
      type: "message.new",
      message: {
        id: "msg-recovered",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
        recipientDeviceId: mockAuthState.deviceId,
        type: "text",
        ciphertext: "valid-envelope",
        createdAt: new Date().toISOString(),
      },
    } as never;

    decodeDirectEnvelopeMock.mockReturnValue({
      header: { dh: new Uint8Array(32).fill(7), pn: 0, n: 0 },
      ciphertext: new Uint8Array([7, 7, 7]),
    });
    loadDecryptedMock.mockResolvedValue(null);

    await useMessagesStore.getState().handleIncomingMessage(incoming);

    expect(useMessagesStore.getState().conversations["user-peer"]?.messages).toHaveLength(1);
    expect(useMessagesStore.getState().conversations["user-peer"]?.messages[0]).toMatchObject({
      id: "msg-recovered",
      status: "error",
      errorKind: "session_missing",
    });
    expect(postMessageAckMock).not.toHaveBeenCalled();

    loadDecryptedMock.mockImplementation(async <T,>(_: CryptoKey, key: string): Promise<T | null> => {
      if (key === "session:device-peer") {
        return serializedSession as T;
      }
      return null;
    });
    ratchetDecryptMock.mockResolvedValue(
      new TextEncoder().encode(JSON.stringify({ text: "recovered payload" }))
    );

    await useMessagesStore.getState().handleIncomingMessage(incoming);

    const conversation = useMessagesStore.getState().conversations["user-peer"];
    expect(conversation?.messages).toHaveLength(1);
    expect(conversation?.messages[0]).toMatchObject({
      id: "msg-recovered",
      status: "delivered",
      content: "recovered payload",
      errorKind: undefined,
    });
    expect(useMessagesStore.getState().processedMessageIds.has("msg-recovered")).toBe(true);
    expect(useMessagesStore.getState().pendingAckMessageIds.has("msg-recovered")).toBe(false);
    expect(postMessageAckMock).toHaveBeenCalledTimes(1);
    expect(postMessageAckMock).toHaveBeenCalledWith("msg-recovered");
  });

  it("hard-fails inbound bootstrap when the peer identity changes unexpectedly", async () => {
    useMessagesStore.setState({
      conversations: {
        "user-peer": {
          userId: "user-peer",
          username: "user-peer",
          messages: [],
          lastMessageAt: 0,
          unreadCount: 0,
          peerIdentityByDevice: {
            "device-peer": "identity-old",
          },
          peerIdentityDeviceId: "device-peer",
          peerIdentityKey: "identity-old",
        },
      },
    });

    await useMessagesStore.getState().handleIncomingMessage({
      type: "message.new",
      message: {
        id: "msg-trust-change",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
        recipientDeviceId: mockAuthState.deviceId,
        type: "text",
        ciphertext: "valid-envelope",
        x3dhHeader: {
          senderIdentityKey: "identity-new",
          ephemeralKey: "ephemeral-new",
          signedPreKeyId: 1,
        },
        createdAt: new Date().toISOString(),
      },
    } as never);

    const conversation = useMessagesStore.getState().conversations["user-peer"];
    expect(conversation?.messages.at(-1)).toMatchObject({
      id: "msg-trust-change",
      status: "error",
      errorKind: "trust_failure",
      content: "[message quarantined due to trust policy]",
    });
    expect(conversation?.peerIdentityAlertsByDevice?.["device-peer"]).toMatchObject({
      previousIdentityKey: "identity-old",
      currentIdentityKey: "identity-new",
    });
    expect(decodeDirectEnvelopeMock).not.toHaveBeenCalled();
    expect(useMessagesStore.getState().processedMessageIds.has("msg-trust-change")).toBe(false);
    expect(postMessageAckMock).not.toHaveBeenCalled();
  });

  it("quarantines sender-key policy violations instead of dropping them silently", async () => {
    decodeDirectEnvelopeMock.mockReturnValue({
      header: { dh: new Uint8Array(32).fill(4), pn: 0, n: 0 },
      ciphertext: new Uint8Array([4, 4, 4]),
    });
    loadDecryptedMock.mockImplementation(async <T,>(_: CryptoKey, key: string): Promise<T | null> => {
      if (key === "session:device-peer") {
        return serializedSession as T;
      }
      return null;
    });
    ratchetDecryptMock.mockResolvedValue(
      new TextEncoder().encode(JSON.stringify({
        schemaVersion: 1,
        type: "sender_key_distribution",
        groupId: "11111111-1111-4111-8111-111111111111",
        senderDeviceId: "22222222-2222-4222-8222-222222222222",
        distributionId: "33333333-3333-4333-8333-333333333333",
        chainId: 1,
        chainKey: "chain-key",
        signingKey: "signing-key",
      }))
    );

    await useMessagesStore.getState().handleIncomingMessage({
      type: "message.new",
      message: {
        id: "msg-sk-policy",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
        recipientDeviceId: mockAuthState.deviceId,
        type: "sender_key_distribution",
        ciphertext: "valid-envelope",
        createdAt: new Date().toISOString(),
      },
    } as never);

    expect(importSenderKeyDistributionMock).not.toHaveBeenCalled();
    expect(useMessagesStore.getState().quarantinedMessageIds.has("msg-sk-policy")).toBe(true);
    expect(useMessagesStore.getState().processedMessageIds.has("msg-sk-policy")).toBe(true);
    expect(postMessageAckMock).toHaveBeenCalledWith("msg-sk-policy");
  });

  it("notifies group pending decrypt retry after importing sender-key distribution", async () => {
    const senderDeviceId = "22222222-2222-4222-8222-222222222222";
    const distribution = {
      schemaVersion: 1,
      type: "sender_key_distribution",
      groupId: "11111111-1111-4111-8111-111111111111",
      senderDeviceId,
      distributionId: "33333333-3333-4333-8333-333333333333",
      chainId: 1,
      chainKey: "chain-key",
      signingKey: "signing-key",
    };
    decodeDirectEnvelopeMock.mockReturnValue({
      header: { dh: new Uint8Array(32).fill(6), pn: 0, n: 0 },
      ciphertext: new Uint8Array([6, 6, 6]),
    });
    loadDecryptedMock.mockImplementation(async <T,>(_: CryptoKey, key: string): Promise<T | null> => {
      if (key === `session:${senderDeviceId}`) {
        return serializedSession as T;
      }
      return null;
    });
    ratchetDecryptMock.mockResolvedValue(
      new TextEncoder().encode(JSON.stringify(distribution))
    );
    importSenderKeyDistributionMock.mockResolvedValue(distribution);

    await useMessagesStore.getState().handleIncomingMessage({
      type: "message.new",
      message: {
        id: "msg-sk-success",
        senderUserId: "user-peer",
        senderDeviceId,
        recipientDeviceId: mockAuthState.deviceId,
        type: "sender_key_distribution",
        ciphertext: "valid-envelope",
        createdAt: new Date().toISOString(),
      },
    } as never);

    expect(importSenderKeyDistributionMock).toHaveBeenCalledWith(
      mockAuthState.storageKey,
      expect.objectContaining(distribution)
    );
    expect(notifySenderKeyDistributionImportedMock).toHaveBeenCalledWith({
      groupId: distribution.groupId,
      senderDeviceId,
      distributionId: distribution.distributionId,
    });
    expect(useMessagesStore.getState().processedMessageIds.has("msg-sk-success")).toBe(true);
    expect(postMessageAckMock).toHaveBeenCalledWith("msg-sk-success");
  });

  it("keeps sender-key distribution pending when storage key is unavailable", async () => {
    mockAuthState.storageKey = null as unknown as CryptoKey;
    try {
      await useMessagesStore.getState().handleIncomingMessage({
        type: "message.new",
        message: {
          id: "msg-sk-storage-missing",
          senderUserId: "user-peer",
          senderDeviceId: "device-peer",
          recipientDeviceId: mockAuthState.deviceId,
          type: "sender_key_distribution",
          ciphertext: "valid-envelope",
          createdAt: new Date().toISOString(),
        },
      } as never);

      expect(importSenderKeyDistributionMock).not.toHaveBeenCalled();
      expect(decodeDirectEnvelopeMock).not.toHaveBeenCalled();
      expect(postMessageAckMock).not.toHaveBeenCalled();
      expect(useMessagesStore.getState().processedMessageIds.has("msg-sk-storage-missing")).toBe(false);
    } finally {
      mockAuthState.storageKey = {} as CryptoKey;
    }
  });
});

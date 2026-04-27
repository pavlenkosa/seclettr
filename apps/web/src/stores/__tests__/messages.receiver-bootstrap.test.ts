import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const apiUploadMock = vi.fn();
const wsSendMock = vi.fn();
const decodeDirectEnvelopeMock = vi.fn();
const storeEncryptedMock = vi.fn(async () => {});
const loadDecryptedMock = vi.fn();
const bootstrapReceiverSessionMock = vi.fn();
const restoreKeyPairFromPrivateKeyMock = vi.fn();
const serializeRatchetStateMock = vi.fn();

const enc = new TextEncoder();

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
  importSenderKeyDistribution: vi.fn(),
}));

vi.mock("@/lib/direct-envelope", () => ({
  decodeDirectEnvelope: decodeDirectEnvelopeMock,
  encodeDirectEnvelope: vi.fn(() => "encoded-envelope"),
}));

vi.mock("@seclettr/crypto", () => ({
  x3dhSend: vi.fn(),
  initSender: vi.fn(),
  ratchetEncrypt: vi.fn(),
  ratchetDecrypt: vi.fn(),
  bootstrapReceiverSession: bootstrapReceiverSessionMock,
  generateKeyPair: vi.fn(),
  generateOneTimePreKeys: vi.fn(),
  encryptAttachment: vi.fn(),
  toBase64Url: (value: Uint8Array) => Buffer.from(value).toString("base64url"),
  fromBase64Url: (value: string) => new Uint8Array(Buffer.from(value, "base64url")),
  storeEncrypted: storeEncryptedMock,
  loadDecrypted: loadDecryptedMock,
  restoreKeyPairFromPrivateKey: restoreKeyPairFromPrivateKeyMock,
  serializeRatchetState: serializeRatchetStateMock,
}));

let useMessagesStore: typeof import("@/stores/messages").useMessagesStore;

const serializedSession = {
  DHs_pub: "pub",
  DHs_priv: "priv",
  DHr: null,
  RK: "rk",
  CKs: null,
  CKr: null,
  Ns: 0,
  Nr: 0,
  PN: 0,
  MKSKIPPED: [] as Array<[string, string]>,
};

const storedDeviceKeys = {
  signedPreKeyPriv: Buffer.alloc(32, 7).toString("base64url"),
  signedPreKeyPub: Buffer.alloc(32, 8).toString("base64url"),
  signedPreKeyId: 77,
  otkPrivateKeys: {
    101: Buffer.alloc(32, 9).toString("base64url"),
  },
};

function buildIncomingMessage(overrides?: Partial<Record<string, unknown>>) {
  return {
    id: "msg-bootstrap",
    senderUserId: "user-peer",
    senderDeviceId: "device-peer",
    recipientDeviceId: mockAuthState.deviceId,
    type: "text",
    ciphertext: "valid-envelope",
    createdAt: new Date().toISOString(),
    x3dhHeader: {
      senderIdentityKey: Buffer.alloc(32, 21).toString("base64url"),
      ephemeralKey: Buffer.alloc(32, 22).toString("base64url"),
      signedPreKeyId: 77,
      oneTimePreKeyId: 101,
    },
    ...overrides,
  };
}

describe("receiver-side bootstrap lifecycle", () => {
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
    storeEncryptedMock.mockClear();
    loadDecryptedMock.mockReset();
    bootstrapReceiverSessionMock.mockReset();
    restoreKeyPairFromPrivateKeyMock.mockReset();
    serializeRatchetStateMock.mockReset();

    apiPostMock.mockResolvedValue({});
    decodeDirectEnvelopeMock.mockReturnValue({
      header: { dh: new Uint8Array(32).fill(5), pn: 0, n: 0 },
      ciphertext: new Uint8Array([1, 2, 3]),
    });
    serializeRatchetStateMock.mockReturnValue(serializedSession);
    restoreKeyPairFromPrivateKeyMock.mockImplementation(
      async (privateKey: Uint8Array, publicKey?: Uint8Array) => ({
        publicKey: publicKey ? new Uint8Array(publicKey) : new Uint8Array(32).fill(privateKey[0] ?? 0xaa),
        privateKey,
      })
    );
    loadDecryptedMock.mockImplementation(async <T,>(_: CryptoKey, key: string): Promise<T | null> => {
      if (key === "session:device-peer") {
        return null;
      }
      if (key === `device:${mockAuthState.deviceId}:keys`) {
        return structuredClone(storedDeviceKeys) as T;
      }
      return null;
    });

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

  it("uses restored non-placeholder public keys and consumes the OTK only after session commit", async () => {
    bootstrapReceiverSessionMock.mockResolvedValue({
      session: { label: "bootstrap-session" },
      plaintext: enc.encode(JSON.stringify({ text: "hello from bootstrap" })),
      consumedOneTimePreKeyId: 101,
    });

    await useMessagesStore.getState().handleIncomingMessage({
      type: "message.new",
      message: buildIncomingMessage(),
    } as never);

    expect(bootstrapReceiverSessionMock).toHaveBeenCalledTimes(1);
    const bootstrapArgs = bootstrapReceiverSessionMock.mock.calls[0]?.[0];
    expect(bootstrapArgs?.receiverSignedPreKeyPair.publicKey).not.toEqual(new Uint8Array(32));
    expect(bootstrapArgs?.receiverOneTimePreKeyPair.publicKey).not.toEqual(new Uint8Array(32));
    const storeEncryptedCalls = storeEncryptedMock.mock.calls as unknown as Array<
      [CryptoKey, string, unknown]
    >;

    const sessionCommitIndex = storeEncryptedCalls.findIndex(
      (call) => call[1] === "session:device-peer"
    );
    const otkCommitIndex = storeEncryptedCalls.findIndex(
      (call) => call[1] === `device:${mockAuthState.deviceId}:keys`
    );

    expect(sessionCommitIndex).toBeGreaterThanOrEqual(0);
    expect(otkCommitIndex).toBeGreaterThan(sessionCommitIndex);

    const otkCommit = storeEncryptedCalls[otkCommitIndex];
    expect(otkCommit?.[2]).toEqual({
      signedPreKeyPriv: storedDeviceKeys.signedPreKeyPriv,
      signedPreKeyPub: storedDeviceKeys.signedPreKeyPub,
      signedPreKeyId: storedDeviceKeys.signedPreKeyId,
      otkPrivateKeys: {},
    });
  });

  it("keeps the OTK available when bootstrap fails before commit", async () => {
    bootstrapReceiverSessionMock.mockRejectedValue(new Error("bootstrap decrypt failed"));

    await useMessagesStore.getState().handleIncomingMessage({
      type: "message.new",
      message: buildIncomingMessage(),
    } as never);

    expect(storeEncryptedMock).not.toHaveBeenCalledWith(
      mockAuthState.storageKey,
      `device:${mockAuthState.deviceId}:keys`,
      expect.anything()
    );
    expect(storeEncryptedMock).not.toHaveBeenCalledWith(
      mockAuthState.storageKey,
      "session:device-peer",
      expect.anything()
    );

    const conversation = useMessagesStore.getState().conversations["user-peer"];
    expect(conversation?.messages.at(-1)).toMatchObject({
      id: "msg-bootstrap",
      status: "error",
      errorKind: "decrypt_failed",
    });
  });

  it("surfaces missing OTK as session_missing and does not call bootstrap or commit", async () => {
    loadDecryptedMock.mockImplementation(async <T,>(_: CryptoKey, key: string): Promise<T | null> => {
      if (key === "session:device-peer") {
        return null;
      }
      if (key === `device:${mockAuthState.deviceId}:keys`) {
        return {
          ...structuredClone(storedDeviceKeys),
          otkPrivateKeys: {},
        } as T;
      }
      return null;
    });

    await useMessagesStore.getState().handleIncomingMessage({
      type: "message.new",
      message: buildIncomingMessage(),
    } as never);

    expect(bootstrapReceiverSessionMock).not.toHaveBeenCalled();
    expect(storeEncryptedMock).not.toHaveBeenCalledWith(
      mockAuthState.storageKey,
      `device:${mockAuthState.deviceId}:keys`,
      expect.anything()
    );

    const conversation = useMessagesStore.getState().conversations["user-peer"];
    expect(conversation?.messages.at(-1)).toMatchObject({
      id: "msg-bootstrap",
      status: "error",
      errorKind: "session_missing",
    });
  });
});

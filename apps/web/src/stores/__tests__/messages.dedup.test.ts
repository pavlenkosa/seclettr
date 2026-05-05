import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as MessagesStore from "@/stores/messages";

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const apiUploadMock = vi.fn();
const wsSendMock = vi.fn();
const decodeDirectEnvelopeMock = vi.fn();
const ratchetDecryptMock = vi.fn();
const storeEncryptedMock = vi.fn(async () => {});
const loadDecryptedMock = vi.fn();
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
  importSenderKeyDistribution: vi.fn(),
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
  fromBase64Url: (value: string) =>
    new Uint8Array(Buffer.from(value, "base64url")),
  storeEncrypted: storeEncryptedMock,
  loadDecrypted: loadDecryptedMock,
  restoreKeyPairFromPrivateKey: vi.fn(
    async (privateKey: Uint8Array, publicKey?: Uint8Array) => ({
      publicKey: publicKey
        ? new Uint8Array(publicKey)
        : new Uint8Array(privateKey),
      privateKey,
    })
  ),
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

let useMessagesStore: typeof MessagesStore.useMessagesStore;

describe("message dedup persistence", () => {
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
    storeEncryptedMock.mockClear();
    loadDecryptedMock.mockReset();
    postMessageAckMock.mockReset();

    mockAuthState.deviceId = `device-self-${crypto.randomUUID()}`;

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === "/messages/pending") {
        return { version: 1, messages: [] };
      }
      throw new Error(`Unexpected api.get path: ${path}`);
    });
    apiPostMock.mockResolvedValue({});
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

  it("restores persisted processed message ids on history bootstrap", async () => {
    const processedStorageKey = `processed-message-ids:v1:${mockAuthState.deviceId}`;
    loadDecryptedMock.mockImplementation(
      async <T>(_: CryptoKey, key: string): Promise<T | null> => {
        if (key === processedStorageKey) {
          return ["persisted-1", "persisted-2"] as T;
        }
        return null;
      }
    );

    await useMessagesStore.getState().loadHistory();

    const ids = useMessagesStore.getState().processedMessageIds;
    expect(ids.has("persisted-1")).toBe(true);
    expect(ids.has("persisted-2")).toBe(true);
  });

  it("does not persist retryable failures to processed message ids", async () => {
    decodeDirectEnvelopeMock.mockReturnValue({
      header: { dh: new Uint8Array(32).fill(8), pn: 0, n: 0 },
      ciphertext: new Uint8Array([8, 8, 8]),
    });
    loadDecryptedMock.mockResolvedValue(null);

    await useMessagesStore.getState().handleIncomingMessage({
      type: "message.new",
      message: {
        id: "incoming-1",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
        recipientDeviceId: mockAuthState.deviceId,
        type: "text",
        ciphertext: "invalid",
        createdAt: new Date().toISOString(),
      },
    } as never);

    await new Promise((resolve) => setTimeout(resolve, 0));

    const processedStorageKey = `processed-message-ids:v1:${mockAuthState.deviceId}`;
    expect(storeEncryptedMock).not.toHaveBeenCalledWith(
      mockAuthState.storageKey,
      processedStorageKey,
      expect.anything()
    );
    expect(
      useMessagesStore.getState().processedMessageIds.has("incoming-1")
    ).toBe(false);
    expect(postMessageAckMock).not.toHaveBeenCalled();
  });

  it("retries pending acknowledgements on duplicate delivery without duplicating the message", async () => {
    decodeDirectEnvelopeMock.mockReturnValue({
      header: { dh: new Uint8Array(32).fill(9), pn: 0, n: 0 },
      ciphertext: new Uint8Array([9, 9, 9]),
    });
    loadDecryptedMock.mockImplementation(
      async <T>(_: CryptoKey, key: string): Promise<T | null> => {
        if (key === "session:device-peer") {
          return {
            DHs_pub: Buffer.alloc(32, 21).toString("base64url"),
            DHs_priv: Buffer.alloc(32, 22).toString("base64url"),
            DHr: Buffer.alloc(32, 23).toString("base64url"),
            RK: Buffer.alloc(32, 24).toString("base64url"),
            CKs: Buffer.alloc(32, 25).toString("base64url"),
            CKr: Buffer.alloc(32, 26).toString("base64url"),
            Ns: 0,
            Nr: 0,
            PN: 0,
            MKSKIPPED: [],
          } as T;
        }
        return null;
      }
    );
    ratchetDecryptMock.mockResolvedValue(
      new TextEncoder().encode(JSON.stringify({ text: "durable hello" }))
    );
    postMessageAckMock
      .mockResolvedValueOnce("failed")
      .mockResolvedValueOnce("acked");

    const incoming = {
      type: "message.new",
      message: {
        id: "msg-dup",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
        recipientDeviceId: mockAuthState.deviceId,
        type: "text",
        ciphertext: "valid-envelope",
        createdAt: new Date().toISOString(),
      },
    } as never;

    await useMessagesStore.getState().handleIncomingMessage(incoming);

    expect(
      useMessagesStore.getState().conversations["user-peer"]?.messages
    ).toHaveLength(1);
    expect(
      useMessagesStore.getState().pendingAckMessageIds.has("msg-dup")
    ).toBe(true);
    expect(ratchetDecryptMock).toHaveBeenCalledTimes(1);
    expect(postMessageAckMock).toHaveBeenCalledTimes(1);

    await useMessagesStore.getState().handleIncomingMessage(incoming);

    expect(
      useMessagesStore.getState().conversations["user-peer"]?.messages
    ).toHaveLength(1);
    expect(
      useMessagesStore.getState().conversations["user-peer"]?.messages[0]
    ).toMatchObject({
      id: "msg-dup",
      content: "durable hello",
      status: "delivered",
    });
    expect(useMessagesStore.getState().processedMessageIds.has("msg-dup")).toBe(
      true
    );
    expect(
      useMessagesStore.getState().pendingAckMessageIds.has("msg-dup")
    ).toBe(false);
    expect(ratchetDecryptMock).toHaveBeenCalledTimes(1);
    expect(postMessageAckMock).toHaveBeenCalledTimes(2);
  });

  it("keeps processed message ids bounded to the configured cap", async () => {
    const initial = new Set<string>();
    for (let index = 0; index < 5000; index += 1) {
      initial.add(`id-${index}`);
    }
    useMessagesStore.setState({ processedMessageIds: initial });

    decodeDirectEnvelopeMock.mockImplementation(() => {
      throw new Error("invalid direct envelope");
    });
    loadDecryptedMock.mockResolvedValue(null);

    await useMessagesStore.getState().handleIncomingMessage({
      type: "message.new",
      message: {
        id: "id-new",
        senderUserId: "user-peer",
        senderDeviceId: "device-peer",
        recipientDeviceId: mockAuthState.deviceId,
        type: "text",
        ciphertext: "invalid",
        createdAt: new Date().toISOString(),
      },
    } as never);

    await new Promise((resolve) => setTimeout(resolve, 0));

    const ids = useMessagesStore.getState().processedMessageIds;
    expect(ids.size).toBe(5000);
    expect(ids.has("id-0")).toBe(false);
    expect(ids.has("id-new")).toBe(true);
  });
});

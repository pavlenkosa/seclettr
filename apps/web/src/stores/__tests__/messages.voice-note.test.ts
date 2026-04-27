import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const apiGetMock = vi.fn();
const apiPostMock = vi.fn();
const apiUploadMock = vi.fn();
const wsSendMock = vi.fn();
const directUploadFetchMock = vi.fn();

const mockAuthState = {
  userId: "user-self",
  deviceId: "device-self",
  storageKey: {} as CryptoKey,
  identityDhKeyPair: {
    publicKey: new Uint8Array(32).fill(1),
    privateKey: new Uint8Array(32).fill(2),
  },
};

const attachmentKey = new Uint8Array(32).fill(7);
const attachmentDigest = new Uint8Array(32).fill(8);
const serializedSession = {
  DHs_pub: Buffer.from([1]).toString("base64url"),
  DHs_priv: Buffer.from([2]).toString("base64url"),
  DHr: Buffer.from([3]).toString("base64url"),
  RK: Buffer.alloc(32, 4).toString("base64url"),
  CKs: Buffer.alloc(32, 5).toString("base64url"),
  CKr: Buffer.alloc(32, 6).toString("base64url"),
  Ns: 0,
  Nr: 0,
  PN: 0,
  MKSKIPPED: [] as Array<[string, string]>,
};

vi.mock("@/lib/api", () => ({
  api: {
    get: apiGetMock,
    post: apiPostMock,
    upload: apiUploadMock,
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
  decodeDirectEnvelope: vi.fn(),
  encodeDirectEnvelope: vi.fn(() => "encoded-envelope"),
}));

vi.mock("@seclettr/crypto", () => ({
  x3dhSend: vi.fn(),
  initSender: vi.fn(),
  initReceiver: vi.fn(),
  ratchetEncrypt: vi.fn(async () => ({
    header: { pn: 0, n: 0 },
    ciphertext: new Uint8Array([9, 9, 9]),
  })),
  ratchetDecrypt: vi.fn(),
  bootstrapReceiverSession: vi.fn(),
  generateKeyPair: vi.fn(),
  generateOneTimePreKeys: vi.fn(),
  encryptAttachment: vi.fn(async () => ({
    data: new Uint8Array([11, 12, 13, 14]),
    key: attachmentKey,
    digest: attachmentDigest,
  })),
  toBase64Url: (value: Uint8Array) => Buffer.from(value).toString("base64url"),
  fromBase64Url: (value: string) => new Uint8Array(Buffer.from(value, "base64url")),
  storeEncrypted: vi.fn(async () => {}),
  loadDecrypted: vi.fn(async <T>(_: CryptoKey, key: string): Promise<T | null> => {
    if (key === "session:device-peer") {
      return serializedSession as T;
    }
    return null;
  }),
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
  serializeRatchetState: vi.fn(() => serializedSession),
}));

let useMessagesStore: typeof import("@/stores/messages").useMessagesStore;

describe("useMessagesStore.sendVoiceNote", () => {
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
    directUploadFetchMock.mockResolvedValue(new Response("", { status: 200 }));
    vi.stubGlobal("fetch", directUploadFetchMock);

    ({ useMessagesStore } = await import("@/stores/messages"));
  });

  beforeEach(() => {
    apiGetMock.mockReset();
    apiPostMock.mockReset();
    apiUploadMock.mockReset();
    wsSendMock.mockReset();
    directUploadFetchMock.mockClear();
    directUploadFetchMock.mockResolvedValue(new Response("", { status: 200 }));

    apiGetMock.mockImplementation(async (path: string) => {
      if (path === "/users/user-peer/devices") {
        return {
          devices: [
            { deviceId: "device-self", identityKeyPublic: "self-identity" },
            { deviceId: "device-peer", identityKeyPublic: "peer-identity" },
          ],
        };
      }
      throw new Error(`Unexpected api.get path: ${path}`);
    });

    apiPostMock.mockImplementation(async (path: string) => {
      if (path === "/attachments/init-upload") {
        return {
          attachmentId: "11111111-1111-4111-8111-111111111111",
          uploadUrl: "https://upload.test/11111111-1111-4111-8111-111111111111",
          fields: { key: "value" },
        };
      }
      if (path === "/users/user-peer/direct-relationship") {
        return {};
      }
      if (path === "/messages") {
        return {};
      }
      throw new Error(`Unexpected api.post path: ${path}`);
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

  it("sends voice_note attachments over the encrypted attachment pipeline", async () => {
    const voiceBlob = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: "audio/webm" });

    await useMessagesStore.getState().sendVoiceNote("user-peer", voiceBlob, 4_200);

    expect(directUploadFetchMock).toHaveBeenCalledTimes(1);
    expect(apiUploadMock).not.toHaveBeenCalled();

    expect(apiPostMock).toHaveBeenCalledTimes(2);
    expect(apiPostMock).toHaveBeenNthCalledWith(
      2,
      "/messages",
      expect.objectContaining({
        recipientUserId: "user-peer",
        messages: [
          expect.objectContaining({
            recipientDeviceId: "device-peer",
            type: "attachment",
            attachmentId: "11111111-1111-4111-8111-111111111111",
            ciphertext: "encoded-envelope",
          }),
        ],
      })
    );

    const conversation = useMessagesStore.getState().conversations["user-peer"];
    expect(conversation).toBeDefined();
    expect(conversation?.messages).toHaveLength(1);
    expect(conversation?.messages[0]).toMatchObject({
      type: "attachment",
      content: "[voice note]",
      status: "sent",
      isOwn: true,
      attachment: {
        attachmentId: "11111111-1111-4111-8111-111111111111",
        mimeType: "audio/webm",
        size: 5,
        kind: "voice_note",
        durationMs: 4_200,
      },
    });
  });

  it("sends video_note attachments over the encrypted attachment pipeline", async () => {
    const videoBlob = new Blob([new Uint8Array([6, 7, 8, 9, 10, 11])], { type: "video/webm" });

    await useMessagesStore.getState().sendVideoNote("user-peer", videoBlob, 12_000);

    expect(directUploadFetchMock).toHaveBeenCalledTimes(1);
    expect(apiUploadMock).not.toHaveBeenCalled();

    expect(apiPostMock).toHaveBeenCalledTimes(2);
    expect(apiPostMock).toHaveBeenNthCalledWith(
      2,
      "/messages",
      expect.objectContaining({
        recipientUserId: "user-peer",
        messages: [
          expect.objectContaining({
            recipientDeviceId: "device-peer",
            type: "attachment",
            attachmentId: "11111111-1111-4111-8111-111111111111",
            ciphertext: "encoded-envelope",
          }),
        ],
      })
    );

    const conversation = useMessagesStore.getState().conversations["user-peer"];
    expect(conversation).toBeDefined();
    expect(conversation?.messages).toHaveLength(1);
    expect(conversation?.messages[0]).toMatchObject({
      type: "attachment",
      content: "[video note]",
      status: "sent",
      isOwn: true,
      attachment: {
        attachmentId: "11111111-1111-4111-8111-111111111111",
        mimeType: "video/webm",
        size: 6,
        kind: "video_note",
        durationMs: 12_000,
      },
    });
  });
});

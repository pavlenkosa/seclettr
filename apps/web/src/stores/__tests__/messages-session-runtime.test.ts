import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as SessionRuntime from "@/stores/messages/session-runtime";

const bootstrapReceiverSessionMock = vi.fn();
const deserializeRatchetStateMock = vi.fn();
const generateKeyPairMock = vi.fn();
const initSenderMock = vi.fn();
const loadDecryptedMock = vi.fn();
const restoreKeyPairFromPrivateKeyMock = vi.fn();
const serializeRatchetStateMock = vi.fn();
const storeEncryptedMock = vi.fn();
const x3dhSendMock = vi.fn();

vi.mock("@seclettr/crypto", () => ({
  bootstrapReceiverSession: bootstrapReceiverSessionMock,
  deserializeRatchetState: deserializeRatchetStateMock,
  fromBase64Url: (value: string) => new Uint8Array(Buffer.from(value, "base64url")),
  generateKeyPair: generateKeyPairMock,
  initSender: initSenderMock,
  loadDecrypted: loadDecryptedMock,
  restoreKeyPairFromPrivateKey: restoreKeyPairFromPrivateKeyMock,
  serializeRatchetState: serializeRatchetStateMock,
  storeEncrypted: storeEncryptedMock,
  toBase64Url: (value: Uint8Array) => Buffer.from(value).toString("base64url"),
  x3dhSend: x3dhSendMock,
}));

let createMessageSessionRuntime: typeof SessionRuntime.createMessageSessionRuntime;

const storageKey = {} as CryptoKey;
const identityKeyPair = {
  publicKey: new Uint8Array(32).fill(1),
  privateKey: new Uint8Array(32).fill(2) as Uint8Array & { readonly __brand: "PrivateKeyBytes" },
};

const serializedSession = {
  DHs_pub: Buffer.alloc(32, 7).toString("base64url"),
  DHs_priv: Buffer.alloc(32, 8).toString("base64url"),
  DHr: null,
  RK: Buffer.alloc(32, 9).toString("base64url"),
  CKs: null,
  CKr: null,
  Ns: 0,
  Nr: 0,
  PN: 0,
  MKSKIPPED: [] as Array<[string, string]>,
};

describe("message session runtime", () => {
  beforeAll(async () => {
    ({ createMessageSessionRuntime } = await import("@/stores/messages/session-runtime"));
  });

  beforeEach(() => {
    bootstrapReceiverSessionMock.mockReset();
    deserializeRatchetStateMock.mockReset();
    generateKeyPairMock.mockReset();
    initSenderMock.mockReset();
    loadDecryptedMock.mockReset();
    restoreKeyPairFromPrivateKeyMock.mockReset();
    serializeRatchetStateMock.mockReset();
    storeEncryptedMock.mockReset();
    x3dhSendMock.mockReset();

    restoreKeyPairFromPrivateKeyMock.mockImplementation(async (
      privateKey: Uint8Array,
      publicKey?: Uint8Array
    ) => ({
      publicKey: publicKey ? new Uint8Array(publicKey) : new Uint8Array(32).fill(privateKey[0] ?? 0xaa),
      privateKey,
    }));
    serializeRatchetStateMock.mockReturnValue(serializedSession);
    storeEncryptedMock.mockResolvedValue(undefined);

    deserializeRatchetStateMock.mockImplementation(async (s: typeof serializedSession) => {
      const fromB64 = (str: string) => new Uint8Array(Buffer.from(str, "base64url"));
      const DHs = await restoreKeyPairFromPrivateKeyMock(
        fromB64(s.DHs_priv),
        s.DHs_pub ? fromB64(s.DHs_pub) : undefined
      );
      return {
        DHs,
        DHr: s.DHr ? fromB64(s.DHr) : null,
        RK: fromB64(s.RK),
        CKs: s.CKs ? fromB64(s.CKs) : null,
        CKr: s.CKr ? fromB64(s.CKr) : null,
        Ns: s.Ns, Nr: s.Nr, PN: s.PN,
        MKSKIPPED: new Map((s.MKSKIPPED ?? []).map(([k, v]: [string, string]) => [k, fromB64(v)])),
      };
    });
  });

  it("restores persisted ratchet state with the stored public key half", async () => {
    loadDecryptedMock.mockResolvedValue(serializedSession);

    const runtime = createMessageSessionRuntime({
      getStorageKey: () => storageKey,
      getIdentityKeyPair: () => identityKeyPair,
      fetchPrekeyBundle: vi.fn(),
    });

    const restored = await runtime.loadSession("device-peer");

    expect(restored).toBeTruthy();
    expect(restoreKeyPairFromPrivateKeyMock).toHaveBeenCalledWith(
      new Uint8Array(Buffer.from(serializedSession.DHs_priv, "base64url")),
      new Uint8Array(Buffer.from(serializedSession.DHs_pub, "base64url"))
    );
  });

  it("eagerly commits session and OTK inside bootstrapInboundSession; commit() is a no-op", async () => {
    loadDecryptedMock.mockImplementation(async <T,>(_: CryptoKey, key: string): Promise<T | null> => {
      if (key === "device:device-self:keys") {
        return {
          signedPreKeyPriv: Buffer.alloc(32, 3).toString("base64url"),
          signedPreKeyPub: Buffer.alloc(32, 4).toString("base64url"),
          signedPreKeyId: 77,
          otkPrivateKeys: {
            101: Buffer.alloc(32, 5).toString("base64url"),
          },
        } as T;
      }
      return null;
    });
    bootstrapReceiverSessionMock.mockResolvedValue({
      session: { label: "bootstrap-session" },
      plaintext: new TextEncoder().encode(JSON.stringify({ text: "hello" })),
      consumedOneTimePreKeyId: 101,
    });

    const runtime = createMessageSessionRuntime({
      getStorageKey: () => storageKey,
      getIdentityKeyPair: () => identityKeyPair,
      fetchPrekeyBundle: vi.fn(),
    });

    const bootstrap = await runtime.bootstrapInboundSession({
      localDeviceId: "device-self",
      senderDeviceId: "device-peer",
      x3dhHeader: {
        senderIdentityKey: Buffer.alloc(32, 11).toString("base64url"),
        ephemeralKey: Buffer.alloc(32, 12).toString("base64url"),
        signedPreKeyId: 77,
        oneTimePreKeyId: 101,
      },
      initialMessage: {
        header: { dh: new Uint8Array(32).fill(9), pn: 0, n: 0 },
        ciphertext: new Uint8Array([1, 2, 3]),
      },
      associatedData: new Uint8Array([8, 8, 8]),
    });

    expect(bootstrapReceiverSessionMock).toHaveBeenCalledTimes(1);
    expect(
      bootstrapReceiverSessionMock.mock.calls[0]?.[0]?.receiverSignedPreKeyPair.publicKey
    ).not.toEqual(new Uint8Array(32));
    expect(
      bootstrapReceiverSessionMock.mock.calls[0]?.[0]?.receiverOneTimePreKeyPair.publicKey
    ).not.toEqual(new Uint8Array(32));

    // Session and OTK removal must be persisted eagerly inside bootstrapInboundSession,
    // not deferred to commit() — a crash between return and commit() would leave the OTK
    // in storage and create a replay window.
    const storeCalls = storeEncryptedMock.mock.calls as Array<[CryptoKey, string, unknown]>;
    const sessionCommitIndex = storeCalls.findIndex((call) => call[1] === "session:device-peer");
    const otkCommitIndex = storeCalls.findIndex((call) => call[1] === "device:device-self:keys");
    expect(sessionCommitIndex).toBeGreaterThanOrEqual(0);
    expect(otkCommitIndex).toBeGreaterThan(sessionCommitIndex);
    expect(storeCalls[otkCommitIndex]?.[2]).toEqual({
      signedPreKeyPriv: Buffer.alloc(32, 3).toString("base64url"),
      signedPreKeyPub: Buffer.alloc(32, 4).toString("base64url"),
      signedPreKeyId: 77,
      otkPrivateKeys: {},
    });

    // commit() is now a no-op — calling it must not store additional data.
    const callCountBeforeCommit = storeEncryptedMock.mock.calls.length;
    await bootstrap.commit();
    expect(storeEncryptedMock.mock.calls.length).toBe(callCountBeforeCommit);
  });

  it("creates and persists a new outbound session from the current prekey bundle", async () => {
    const fetchPrekeyBundle = vi.fn().mockResolvedValue({
      registrationId: 10,
      identityKeyPublic: Buffer.alloc(32, 21).toString("base64url"),
      signingKeyPublic: Buffer.alloc(32, 22).toString("base64url"),
      signedPreKey: {
        id: 77,
        publicKey: Buffer.alloc(32, 23).toString("base64url"),
        signature: Buffer.alloc(64, 24).toString("base64url"),
      },
      oneTimePreKey: {
        id: 101,
        publicKey: Buffer.alloc(32, 25).toString("base64url"),
        reservationToken: "r".repeat(64),
      },
    });
    loadDecryptedMock.mockResolvedValue(null);
    generateKeyPairMock.mockResolvedValue({
      publicKey: new Uint8Array(32).fill(31),
      privateKey: new Uint8Array(32).fill(32),
    });
    x3dhSendMock.mockResolvedValue({
      sharedSecret: new Uint8Array(32).fill(41),
      associatedData: new Uint8Array([1]),
    });
    initSenderMock.mockResolvedValue({ label: "sender-session" });

    const runtime = createMessageSessionRuntime({
      getStorageKey: () => storageKey,
      getIdentityKeyPair: () => identityKeyPair,
      fetchPrekeyBundle,
    });

    const created = await runtime.getOrCreateOutboundSession("user-peer", "device-peer");

    expect(fetchPrekeyBundle).toHaveBeenCalledWith("user-peer", "device-peer");
    expect(initSenderMock).toHaveBeenCalledTimes(1);
    expect(storeEncryptedMock).toHaveBeenCalledWith(
      storageKey,
      "session:device-peer",
      serializedSession
    );
    expect(created.peerIdentityKeyB64).toBe(Buffer.alloc(32, 21).toString("base64url"));
    expect(created.x3dhHeader).toMatchObject({
      signedPreKeyId: 77,
      oneTimePreKeyId: 101,
      senderIdentityKey: Buffer.from(identityKeyPair.publicKey).toString("base64url"),
    });
    expect(created.oneTimePreKeyReservationToken).toBe("r".repeat(64));
  });
});

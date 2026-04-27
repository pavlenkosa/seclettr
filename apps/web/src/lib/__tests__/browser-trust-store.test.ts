import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetOrCreateStorageKey = vi.fn();
const mockLoadDecrypted = vi.fn();
const mockStoreEncrypted = vi.fn();
const mockClearEncryptedByPrefix = vi.fn();

vi.mock("@/lib/storage-key", () => ({
  getOrCreateStorageKey: mockGetOrCreateStorageKey,
}));

vi.mock("@seclettr/crypto", () => ({
  clearEncryptedByPrefix: mockClearEncryptedByPrefix,
  loadDecrypted: mockLoadDecrypted,
  storeEncrypted: mockStoreEncrypted,
}));

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  } as Storage;
}

describe("browser trust store", () => {
  const storageKey = {} as CryptoKey;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal("localStorage", createLocalStorageMock());
    mockGetOrCreateStorageKey.mockResolvedValue({ key: storageKey, volatile: false });
    mockLoadDecrypted.mockResolvedValue(null);
    mockStoreEncrypted.mockResolvedValue(undefined);
    mockClearEncryptedByPrefix.mockResolvedValue(0);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("migrates legacy local trust records into the encrypted trust store", async () => {
    const {
      getStoredDeviceRegistration,
      getStoredSafetyVerificationRecord,
      getVerificationStorageKey,
      readCachedPeerIdentityKey,
    } = await import("@/lib/browser-trust-store");

    localStorage.setItem("seclettr.registrationId.v1", "1234");
    localStorage.setItem(
      "deviceReg:alice",
      JSON.stringify({
        deviceId: "device-1",
        registrationId: 1234,
        spkId: 7,
      })
    );
    localStorage.setItem(
      getVerificationStorageKey("user-self", "device-self", "user-peer", "peer-device"),
      JSON.stringify({
        safetyHash: "hash-1",
        verifiedAt: "2026-03-26T00:00:00.000Z",
      })
    );
    localStorage.setItem("seclettr.peerIdentity.v1:peer-device", "identity-peer");

    await expect(getStoredDeviceRegistration("alice", storageKey)).resolves.toEqual({
      deviceId: "device-1",
      registrationId: 1234,
      spkId: 7,
    });
    await expect(
      getStoredSafetyVerificationRecord(
        "user-self",
        "device-self",
        "user-peer",
        "peer-device",
        storageKey
      )
    ).resolves.toEqual({
      safetyHash: "hash-1",
      verifiedAt: "2026-03-26T00:00:00.000Z",
    });

    expect(readCachedPeerIdentityKey("peer-device")).toBe("identity-peer");
    expect(mockStoreEncrypted).toHaveBeenCalledWith(
      storageKey,
      "trust-store:v1:browser",
      expect.objectContaining({
        registrationId: 1234,
        deviceRegistrationsByUsername: {
          alice: {
            deviceId: "device-1",
            registrationId: 1234,
            spkId: 7,
          },
        },
        peerIdentityCacheByDevice: {
          "peer-device": "identity-peer",
        },
      })
    );
    expect(localStorage.getItem("seclettr.registrationId.v1")).toBeNull();
    expect(localStorage.getItem("deviceReg:alice")).toBeNull();
    expect(localStorage.getItem("seclettr.peerIdentity.v1:peer-device")).toBeNull();
  });

  it("upgrades a legacy safety record into the scoped encrypted trust record on first read", async () => {
    const {
      getLegacyVerificationStorageKey,
      getStoredSafetyVerificationRecord,
      getVerificationStorageKey,
    } = await import("@/lib/browser-trust-store");

    const legacyKey = getLegacyVerificationStorageKey(
      "user-self",
      "user-peer",
      "peer-device"
    );
    const scopedKey = getVerificationStorageKey(
      "user-self",
      "device-self",
      "user-peer",
      "peer-device"
    );
    localStorage.setItem(
      legacyKey,
      JSON.stringify({
        safetyHash: "legacy-hash",
        verifiedAt: "2026-03-25T00:00:00.000Z",
      })
    );

    await expect(
      getStoredSafetyVerificationRecord(
        "user-self",
        "device-self",
        "user-peer",
        "peer-device",
        storageKey
      )
    ).resolves.toEqual({
      safetyHash: "legacy-hash",
      verifiedAt: "2026-03-25T00:00:00.000Z",
    });

    const lastPersistedStore = mockStoreEncrypted.mock.calls.at(-1)?.[2];
    expect(lastPersistedStore).toMatchObject({
      safetyVerificationRecordsByKey: {
        [scopedKey]: {
          safetyHash: "legacy-hash",
          verifiedAt: "2026-03-25T00:00:00.000Z",
        },
      },
    });
    expect(
      lastPersistedStore?.safetyVerificationRecordsByKey?.[legacyKey]
    ).toBeUndefined();
    expect(localStorage.getItem(legacyKey)).toBeNull();
  });

  it("clears encrypted trust state and any remaining legacy browser trust keys", async () => {
    const { clearBrowserTrustStore } = await import("@/lib/browser-trust-store");

    localStorage.setItem("seclettr.registrationId.v1", "1234");
    localStorage.setItem(
      "deviceReg:alice",
      JSON.stringify({
        deviceId: "device-1",
        registrationId: 1234,
        spkId: 7,
      })
    );
    localStorage.setItem("seclettr.peerIdentity.v1:peer-device", "identity-peer");

    await clearBrowserTrustStore(storageKey);

    expect(mockClearEncryptedByPrefix).toHaveBeenCalledWith("trust-store:v1");
    expect(localStorage.getItem("seclettr.registrationId.v1")).toBeNull();
    expect(localStorage.getItem("deviceReg:alice")).toBeNull();
    expect(localStorage.getItem("seclettr.peerIdentity.v1:peer-device")).toBeNull();
  });

  it("invalidates pre-existing verification records after a trust-store integrity incident until the user re-verifies", async () => {
    const {
      getBrowserTrustIntegrityState,
      getStoredSafetyVerificationRecord,
      getVerificationStorageKey,
      setStoredSafetyVerificationRecord,
    } = await import("@/lib/browser-trust-store");

    const scopedKey = getVerificationStorageKey(
      "user-self",
      "device-self",
      "user-peer",
      "peer-device"
    );
    mockLoadDecrypted.mockResolvedValue({
      version: 1,
      safetyVerificationRecordsByKey: {
        [scopedKey]: {
          safetyHash: "hash-before",
          verifiedAt: "2026-03-25T00:00:00.000Z",
        },
      },
      peerIdentityCacheByDevice: {
        "peer-device": "",
      },
    });

    await expect(
      getStoredSafetyVerificationRecord(
        "user-self",
        "device-self",
        "user-peer",
        "peer-device",
        storageKey
      )
    ).resolves.toBeNull();

    await expect(getBrowserTrustIntegrityState(storageKey)).resolves.toMatchObject({
      degradedAt: expect.any(String),
      issues: expect.arrayContaining(["persisted_peer_identity_invalid"]),
    });

    const rewrittenStore = mockStoreEncrypted.mock.calls.at(-1)?.[2];
    expect(rewrittenStore).toMatchObject({
      peerIdentityCacheByDevice: {},
      integrityIssues: expect.arrayContaining(["persisted_peer_identity_invalid"]),
      integrityDegradedAt: expect.any(String),
    });

    const refreshedRecord = await setStoredSafetyVerificationRecord(
      "user-self",
      "device-self",
      "user-peer",
      "hash-after",
      "peer-device",
      storageKey
    );

    await expect(
      getStoredSafetyVerificationRecord(
        "user-self",
        "device-self",
        "user-peer",
        "peer-device",
        storageKey
      )
    ).resolves.toEqual(refreshedRecord);
  });
});

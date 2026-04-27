import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KeyPair } from "@seclettr/crypto";

const mockApiPost = vi.fn();
const mockApiGet = vi.fn();
const mockPreviewRefreshSession = vi.fn();
const mockRefreshSessionAccessToken = vi.fn();
const mockSetSessionAccessToken = vi.fn();
const mockGetOrCreateStorageKey = vi.fn();
const mockEnsureExportableStorageKey = vi.fn();
const mockLockPersistedStorageKey = vi.fn();
const mockProtectPersistedStorageKeyWithPin = vi.fn();
const mockRemoveStorageKeyPinProtection = vi.fn();
const mockUnlockPersistedStorageKey = vi.fn();
const mockLoadDecrypted = vi.fn();
const mockWsConnect = vi.fn();
const mockWsDisconnect = vi.fn();
let mockAuthErrorHandler: (() => Promise<string | null>) | null = null;
const mockEnsurePushSubscription = vi.fn();
const mockUnsubscribePush = vi.fn();
const mockClearLegacyStorageKeyStorage = vi.fn();
const mockClearPersistedStorageKey = vi.fn();
const mockClearEncryptedByPrefix = vi.fn();
const mockGenerateOneTimePreKeys = vi.fn();
const mockRestoreKeyPairFromPrivateKey = vi.fn();
const mockRestoreSigningKeyPairFromPrivateKey = vi.fn();
const mockSignPublicKey = vi.fn();
const mockStoreEncrypted = vi.fn();
const mockMessagesReset = vi.fn();
const mockGroupsReset = vi.fn();
const mockEnsureCurrentDeviceCryptoMaterialSynced = vi.fn();
const mockMarkCurrentDeviceCryptoMaterialSynced = vi.fn();
const mockClearCurrentDeviceCryptoMaterialSyncCache = vi.fn();
const mockHasPinSet = vi.fn();
const mockSetPinHash = vi.fn();
const mockVerifyPin = vi.fn();
const mockClearPin = vi.fn();
const mockClearLegacyLockSnapshotStorage = vi.fn();

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

const mockApiGetMeUser = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    post: mockApiPost,
    get: mockApiGet,
    getMeUser: mockApiGetMeUser,
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/websocket", () => ({
  wsClient: {
    connect: mockWsConnect,
    disconnect: mockWsDisconnect,
    setAuthErrorHandler: vi.fn((handler: () => Promise<string | null>) => {
      mockAuthErrorHandler = handler;
    }),
    setWsAuthTokenProvider: vi.fn(),
  },
}));

vi.mock("@/lib/push", () => ({
  ensurePushSubscription: mockEnsurePushSubscription,
  unsubscribePush: mockUnsubscribePush,
}));

vi.mock("@/lib/storage-key", () => ({
  clearLegacyStorageKeyStorage: mockClearLegacyStorageKeyStorage,
  clearPersistedStorageKey: mockClearPersistedStorageKey,
  ensureExportableStorageKey: mockEnsureExportableStorageKey,
  getOrCreateStorageKey: mockGetOrCreateStorageKey,
  lockPersistedStorageKey: mockLockPersistedStorageKey,
  protectPersistedStorageKeyWithPin: mockProtectPersistedStorageKeyWithPin,
  removeStorageKeyPinProtection: mockRemoveStorageKeyPinProtection,
  unlockPersistedStorageKey: mockUnlockPersistedStorageKey,
}));

vi.mock("@/lib/session-preview", () => ({
  previewRefreshSession: mockPreviewRefreshSession,
}));

vi.mock("@/lib/session", () => ({
  refreshSessionAccessToken: mockRefreshSessionAccessToken,
  setSessionAccessToken: mockSetSessionAccessToken,
}));

vi.mock("@/lib/current-device-crypto-material", () => ({
  clearCurrentDeviceCryptoMaterialSyncCache:
    mockClearCurrentDeviceCryptoMaterialSyncCache,
  ensureCurrentDeviceCryptoMaterialSynced:
    mockEnsureCurrentDeviceCryptoMaterialSynced,
  markCurrentDeviceCryptoMaterialSynced:
    mockMarkCurrentDeviceCryptoMaterialSynced,
}));

vi.mock("@/lib/app-lock-pin", () => ({
  clearLegacyLockSnapshotStorage: mockClearLegacyLockSnapshotStorage,
  clearPin: mockClearPin,
  hasPinSet: mockHasPinSet,
  setPinHash: mockSetPinHash,
  verifyPin: mockVerifyPin,
}));

vi.mock("@seclettr/crypto", () => ({
  clearEncryptedByPrefix: mockClearEncryptedByPrefix,
  fromBase64Url: vi.fn(() => new Uint8Array()),
  generateIdentityBundle: vi.fn(),
  generateOneTimePreKeys: mockGenerateOneTimePreKeys,
  generateSignedPreKey: vi.fn(),
  loadDecrypted: mockLoadDecrypted,
  restoreKeyPairFromPrivateKey: mockRestoreKeyPairFromPrivateKey,
  restoreSigningKeyPairFromPrivateKey: mockRestoreSigningKeyPairFromPrivateKey,
  signPublicKey: mockSignPublicKey,
  storeEncrypted: mockStoreEncrypted,
  toBase64Url: vi.fn(() => ""),
}));

vi.mock("@/stores/messages", () => ({
  useMessagesStore: {
    getState: () => ({
      reset: mockMessagesReset,
    }),
  },
}));

vi.mock("@/stores/groups", () => ({
  useGroupsStore: {
    getState: () => ({
      reset: mockGroupsReset,
    }),
  },
}));

function createStoredDeviceKeys() {
  return {
    dhPrivateKey: "dh-private",
    dhPublicKey: "dh-public",
    signingPrivateKey: "sign-private",
    signingPublicKey: "sign-public",
    signedPreKeyPriv: "spk-private",
    signedPreKeyPub: "spk-public",
    signedPreKeySig: "spk-signature",
    signedPreKeyId: 77,
    otkPrivateKeys: {
      7: "otk-private",
    },
  };
}

function createAccessToken(payload: { sub: string; deviceId: string }): string {
  return [
    "header",
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "sig",
  ].join(".");
}

describe("useAuthStore auth lifecycle", () => {
	  beforeEach(() => {
	    vi.clearAllMocks();
	    vi.resetModules();
	    mockAuthErrorHandler = null;
	    vi.stubGlobal("localStorage", createLocalStorageMock());
    vi.stubGlobal("sessionStorage", createLocalStorageMock());
    localStorage.clear();
    sessionStorage.clear();

    mockPreviewRefreshSession.mockResolvedValue(null);
    mockRefreshSessionAccessToken.mockResolvedValue(null);
    mockGetOrCreateStorageKey.mockResolvedValue({ key: {} as CryptoKey, volatile: false });
    mockEnsureExportableStorageKey.mockImplementation(async (key: CryptoKey) => ({
      key,
      volatile: false,
    }));
    mockLockPersistedStorageKey.mockResolvedValue(undefined);
    mockProtectPersistedStorageKeyWithPin.mockResolvedValue(undefined);
    mockRemoveStorageKeyPinProtection.mockResolvedValue(undefined);
    mockUnlockPersistedStorageKey.mockResolvedValue({
      key: {} as CryptoKey,
      volatile: false,
    });
    mockLoadDecrypted.mockResolvedValue(null);
    mockEnsurePushSubscription.mockResolvedValue(undefined);
    mockUnsubscribePush.mockResolvedValue(undefined);
    mockClearPersistedStorageKey.mockResolvedValue(undefined);
    mockClearEncryptedByPrefix.mockResolvedValue(0);
    mockGenerateOneTimePreKeys.mockResolvedValue([]);
    mockStoreEncrypted.mockResolvedValue(undefined);
    mockClearCurrentDeviceCryptoMaterialSyncCache.mockReset();
    mockEnsureCurrentDeviceCryptoMaterialSynced.mockResolvedValue(true);
    mockMarkCurrentDeviceCryptoMaterialSynced.mockReset();
    mockApiGetMeUser.mockResolvedValue(null);
    mockHasPinSet.mockResolvedValue(false);
    mockSetPinHash.mockResolvedValue(undefined);
    mockVerifyPin.mockResolvedValue(true);
    mockClearPin.mockResolvedValue(undefined);
    mockClearLegacyLockSnapshotStorage.mockReset();
    mockRestoreKeyPairFromPrivateKey.mockResolvedValue({
      privateKey: new Uint8Array([1]),
      publicKey: new Uint8Array([2]),
    });
    mockRestoreSigningKeyPairFromPrivateKey.mockResolvedValue({
      privateKey: new Uint8Array([3]),
      publicKey: new Uint8Array([4]),
    });
    mockSignPublicKey.mockResolvedValue(new Uint8Array([5]));
  });

  it("falls back to the logged-out state when no refresh session exists", async () => {
    const { useAuthStore } = await import("@/stores/auth");

    const restored = await useAuthStore.getState().tryRestoreSession();
    const state = useAuthStore.getState();

    expect(restored).toBe(false);
    expect(mockPreviewRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockRefreshSessionAccessToken).not.toHaveBeenCalled();
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(state.authLifecycle).toBe("signed_out");
    expect(state.authRecoveryReason).toBeNull();
    expect(state.authOperation).toBe("idle");
    expect(state.userId).toBeNull();
    expect(state.deviceId).toBeNull();
    expect(state.identityDhKeyPair).toBeNull();
  });

  it("restores into the locked lifecycle without rotating refresh when the PIN-protected storage key is still locked", async () => {
    mockHasPinSet.mockResolvedValue(true);
    mockPreviewRefreshSession.mockResolvedValue({
      userId: "user-1",
      deviceId: "device-1",
      username: "alice",
    });
    mockRefreshSessionAccessToken.mockResolvedValue(
      createAccessToken({ sub: "user-1", deviceId: "device-1" })
    );
    mockGetOrCreateStorageKey.mockRejectedValue(new Error("storage_key_locked"));

    const { useAuthStore } = await import("@/stores/auth");

    const restored = await useAuthStore.getState().tryRestoreSession();

    expect(restored).toBe(false);
    expect(mockPreviewRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockRefreshSessionAccessToken).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      authLifecycle: "locked",
      accessToken: null,
      pinEnabled: true,
      userId: "user-1",
      deviceId: "device-1",
      username: "alice",
    });
  });

  it("surfaces restore error without rotating refresh when local E2EE keys are unavailable", async () => {
    const accessToken = createAccessToken({ sub: "user-1", deviceId: "device-1" });

    mockPreviewRefreshSession.mockResolvedValue({
      userId: "user-1",
      deviceId: "device-1",
      username: "alice",
    });
    mockRefreshSessionAccessToken.mockResolvedValue(accessToken);
    mockGetOrCreateStorageKey.mockResolvedValue({ key: {} as CryptoKey });
    mockLoadDecrypted.mockResolvedValue(null);

    const { useAuthStore } = await import("@/stores/auth");

    const restored = await useAuthStore.getState().tryRestoreSession();
    const state = useAuthStore.getState();

    expect(restored).toBe(false);
    expect(mockPreviewRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockRefreshSessionAccessToken).not.toHaveBeenCalled();
    expect(mockLoadDecrypted).toHaveBeenCalledWith(
      expect.anything(),
      "device:device-1:keys"
    );
    expect(state.authLifecycle).toBe("recovery_required");
    expect(state.authRecoveryReason).toBe("missing_local_keys");
    expect(state.authOperation).toBe("idle");
    expect(state.error).toContain("Local E2EE keys are missing");
  });

  it("classifies unexpected restore failures into recovery_required instead of a vague restore flag", async () => {
    mockPreviewRefreshSession.mockResolvedValue({
      userId: "user-1",
      deviceId: "device-1",
      username: "alice",
    });
    mockGetOrCreateStorageKey.mockRejectedValue(new Error("idb unavailable"));

    const { useAuthStore } = await import("@/stores/auth");

    const restored = await useAuthStore.getState().tryRestoreSession();
    const state = useAuthStore.getState();

    expect(restored).toBe(false);
    expect(state.authLifecycle).toBe("recovery_required");
    expect(state.authRecoveryReason).toBe("unexpected_restore_failure");
    expect(state.error).toContain("Session restore failed unexpectedly");
  });

  it("attempts current-device crypto repair during restore with the normalized public bundle", async () => {
    const accessToken = createAccessToken({ sub: "user-1", deviceId: "device-1" });
    const storageKey = {} as CryptoKey;
    const storedKeys = createStoredDeviceKeys();

    mockPreviewRefreshSession.mockResolvedValue({
      userId: "user-1",
      deviceId: "device-1",
      username: "alice",
    });
    mockRefreshSessionAccessToken.mockResolvedValue(accessToken);
    mockGetOrCreateStorageKey.mockResolvedValue({ key: storageKey, volatile: false });
    mockLoadDecrypted.mockResolvedValue(storedKeys);
    mockApiGetMeUser.mockResolvedValue({ userId: "user-1", username: "alice" });

    const { useAuthStore } = await import("@/stores/auth");

    await expect(useAuthStore.getState().tryRestoreSession()).resolves.toBe(true);

    expect(mockPreviewRefreshSession).toHaveBeenCalledTimes(1);
    expect(mockRefreshSessionAccessToken).toHaveBeenCalledTimes(1);
    expect(
      mockRefreshSessionAccessToken.mock.invocationCallOrder[0]
    ).toBeGreaterThan(mockLoadDecrypted.mock.invocationCallOrder[0]!);
    expect(mockEnsureCurrentDeviceCryptoMaterialSynced).toHaveBeenCalledWith(
      {
        userId: "user-1",
        deviceId: "device-1",
        identityKeyPublic: "",
        signingKeyPublic: "",
        signedPreKey: {
          id: 77,
          publicKey: "",
          signature: "",
        },
      },
      { logScope: "auth.restore" }
    );
  });

  it("keeps restore successful when the proactive crypto repair attempt fails", async () => {
    const accessToken = createAccessToken({ sub: "user-1", deviceId: "device-1" });

    mockPreviewRefreshSession.mockResolvedValue({
      userId: "user-1",
      deviceId: "device-1",
      username: "alice",
    });
    mockRefreshSessionAccessToken.mockResolvedValue(accessToken);
    mockGetOrCreateStorageKey.mockResolvedValue({ key: {} as CryptoKey, volatile: false });
    mockLoadDecrypted.mockResolvedValue(createStoredDeviceKeys());
    mockEnsureCurrentDeviceCryptoMaterialSynced.mockResolvedValue(false);
    mockApiGetMeUser.mockResolvedValue({ userId: "user-1", username: "alice" });

    const { useAuthStore } = await import("@/stores/auth");

    await expect(useAuthStore.getState().tryRestoreSession()).resolves.toBe(true);
    expect(useAuthStore.getState()).toMatchObject({
      authLifecycle: "ready",
      userId: "user-1",
      deviceId: "device-1",
      username: "alice",
    });
  });

  it("fails login instead of silently reprovisioning when saved device keys are missing", async () => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    localStorage.setItem(
      "deviceReg:alice",
      JSON.stringify({
        deviceId: "device-1",
        registrationId: 1234,
        spkId: 1,
      })
    );
    mockGetOrCreateStorageKey.mockResolvedValue({ key: {} as CryptoKey });
    mockLoadDecrypted.mockResolvedValue(null);

    const { useAuthStore } = await import("@/stores/auth");

    await expect(
      useAuthStore.getState().login("alice", "TestPassword123!", "Browser")
    ).rejects.toThrow("Local secure keys for this device are missing");
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it("clears local secure material on logout instead of preserving device continuity", async () => {
    const storageKey = {} as CryptoKey;
    mockApiPost.mockResolvedValue({});

    const { useAuthStore } = await import("@/stores/auth");
    useAuthStore.setState({
      userId: "user-1",
      deviceId: "device-1",
      username: "alice",
      accessToken: "access-token-1",
      storageKey,
      storageKeyVolatile: false,
      authLifecycle: "ready",
      authRecoveryReason: null,
      authOperation: "idle",
      error: null,
      pinEnabled: true,
      cryptoReady: true,
    });

    await useAuthStore.getState().logout();

    expect(mockClearLegacyStorageKeyStorage).toHaveBeenCalledTimes(1);
    expect(mockClearPersistedStorageKey).toHaveBeenCalledTimes(1);
    expect(mockClearEncryptedByPrefix).toHaveBeenCalledWith("device:");
    expect(mockClearEncryptedByPrefix).toHaveBeenCalledWith("session:");
    expect(mockClearPin).toHaveBeenCalledTimes(1);
    expect(mockMessagesReset).toHaveBeenCalledTimes(1);
    expect(mockGroupsReset).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      authLifecycle: "signed_out",
      pinEnabled: false,
      cryptoReady: false,
    });
  });

  it("handles websocket refresh failure without wiping local device material", async () => {
    const storageKey = {} as CryptoKey;

    const { useAuthStore } = await import("@/stores/auth");
    useAuthStore.setState({
      userId: "user-1",
      deviceId: "device-1",
      username: "alice",
      accessToken: "access-token-1",
      storageKey,
      storageKeyVolatile: false,
      authLifecycle: "ready",
      authRecoveryReason: null,
      authOperation: "idle",
      error: null,
      pinEnabled: true,
      cryptoReady: true,
    });

    expect(mockAuthErrorHandler).not.toBeNull();
    mockRefreshSessionAccessToken.mockResolvedValueOnce(null);

    await expect(mockAuthErrorHandler?.()).resolves.toBeNull();

    expect(mockWsDisconnect).toHaveBeenCalledTimes(1);
    expect(mockSetSessionAccessToken).toHaveBeenCalledWith(null);
    expect(mockMessagesReset).toHaveBeenCalledTimes(1);
    expect(mockGroupsReset).toHaveBeenCalledTimes(1);
    expect(mockApiPost).not.toHaveBeenCalledWith("/auth/logout");
    expect(mockClearEncryptedByPrefix).not.toHaveBeenCalled();
    expect(mockClearLegacyStorageKeyStorage).not.toHaveBeenCalled();
    expect(mockClearPersistedStorageKey).not.toHaveBeenCalled();
    expect(mockClearPin).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      authLifecycle: "signed_out",
      accessToken: null,
      storageKey: null,
      cryptoReady: false,
    });
  });

  it("ignores lock requests when no app-lock PIN is configured", async () => {
    const storageKey = {} as CryptoKey;

    const { useAuthStore } = await import("@/stores/auth");
    useAuthStore.setState({
      userId: "user-1",
      deviceId: "device-1",
      username: "alice",
      accessToken: "access-token-1",
      identityDhKeyPair: {
        privateKey: new Uint8Array([1]),
        publicKey: new Uint8Array([2]),
      } as KeyPair,
      storageKey,
      storageKeyVolatile: false,
      authLifecycle: "ready",
      authRecoveryReason: null,
      authOperation: "idle",
      error: null,
      pinEnabled: false,
    });

    await useAuthStore.getState().lock();

    expect(mockLockPersistedStorageKey).not.toHaveBeenCalled();
    expect(mockSetSessionAccessToken).not.toHaveBeenCalledWith(null);
    expect(useAuthStore.getState()).toMatchObject({
      authLifecycle: "ready",
      accessToken: "access-token-1",
      identityDhKeyPair: expect.any(Object),
      storageKey,
    });
  });

  it("locks by dropping in-memory keys and unlocks back into the ready lifecycle", async () => {
    const storageKey = {} as CryptoKey;
    const accessToken = createAccessToken({ sub: "user-1", deviceId: "device-1" });
    mockPreviewRefreshSession.mockResolvedValue({
      userId: "user-1",
      deviceId: "device-1",
      username: "alice",
    });
    mockRefreshSessionAccessToken.mockResolvedValue(accessToken);
    mockGetOrCreateStorageKey.mockResolvedValue({ key: storageKey, volatile: false });
    mockLoadDecrypted.mockResolvedValue(createStoredDeviceKeys());
    mockApiGetMeUser.mockResolvedValue({ userId: "user-1", username: "alice" });

    const { useAuthStore } = await import("@/stores/auth");
    useAuthStore.setState({
      userId: "user-1",
      deviceId: "device-1",
      username: "alice",
      accessToken,
      identityDhKeyPair: {
        privateKey: new Uint8Array([1]),
        publicKey: new Uint8Array([2]),
      } as KeyPair,
      storageKey,
      storageKeyVolatile: false,
      authLifecycle: "ready",
      authRecoveryReason: null,
      authOperation: "idle",
      error: null,
      pinEnabled: true,
    });

    await useAuthStore.getState().lock();

    expect(useAuthStore.getState()).toMatchObject({
      authLifecycle: "locked",
      accessToken: null,
      authOperation: "idle",
      identityDhKeyPair: null,
      storageKey: null,
    });
    expect(mockLockPersistedStorageKey).toHaveBeenCalledTimes(1);
    expect(mockSetSessionAccessToken).toHaveBeenCalledWith(null);

    await expect(useAuthStore.getState().unlock("1234")).resolves.toBe(true);

    expect(mockWsConnect).toHaveBeenLastCalledWith(accessToken);
    expect(useAuthStore.getState()).toMatchObject({
      authLifecycle: "ready",
      authRecoveryReason: null,
      authOperation: "idle",
      userId: "user-1",
      deviceId: "device-1",
      username: "alice",
    });
  });

  it("keeps destructive local reset as the path that forgets the browser device state", async () => {
    localStorage.setItem("seclettr.registrationId.v1", "1234");
    localStorage.setItem(
      "deviceReg:alice",
      JSON.stringify({
        deviceId: "device-1",
        registrationId: 1234,
        spkId: 1,
      })
    );
    mockApiPost.mockResolvedValue({});

    const { useAuthStore } = await import("@/stores/auth");

    await useAuthStore.getState().resetLocalDeviceData();

    expect(mockClearPersistedStorageKey).toHaveBeenCalledTimes(1);
    expect(mockClearEncryptedByPrefix).toHaveBeenCalledWith("device:");
    expect(mockClearEncryptedByPrefix).toHaveBeenCalledWith("session:");
    expect(localStorage.getItem("deviceReg:alice")).toBeNull();
    expect(localStorage.getItem("seclettr.registrationId.v1")).toBeNull();
    expect(mockMessagesReset).toHaveBeenCalledTimes(1);
    expect(mockGroupsReset).toHaveBeenCalledTimes(1);
  });
});

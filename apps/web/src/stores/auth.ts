/**
 * Auth store — manages user/device identity and session tokens.
 *
 * On first login/register:
 *  1. Generate identity bundle (X25519 DH + Ed25519 signing keypair)
 *  2. Generate signed prekey + OTK pool
 *  3. Send public parts to server → receive JWT
 *  4. Store private keys in encrypted IndexedDB
 *
 * On page load:
 *  1. Preview refresh-cookie session identity without rotating the session
 *  2. Prove local private keys are recoverable from IndexedDB
 *  3. Rotate refresh token and resume runtime transports
 */
import { create } from "zustand";
import { api } from "@/lib/api";
import {
  generateIdentityBundle,
  generateSignedPreKey,
  generateOneTimePreKeys,
  storeEncrypted,
  loadDecrypted,
  toBase64Url,
} from "@seclettr/crypto";
import {
  type StoredDeviceKeys,
  hasUsableDeviceKeys,
  normalizeStoredDeviceKeys,
  toCurrentDeviceCryptoMaterial,
} from "./auth-device-keys";
import {
  AUTH_PROTOCOL_VERSION,
  type RegisterResponse,
  type LoginResponse,
} from "@seclettr/protocol";
import {
  ensureExportableStorageKey,
  getOrCreateStorageKey,
  lockPersistedStorageKey,
  protectPersistedStorageKeyWithPin,
  removeStorageKeyPinProtection,
  unlockPersistedStorageKey,
} from "@/lib/storage-key";
import {
  markCurrentDeviceCryptoMaterialSynced,
} from "@/lib/current-device-crypto-material";
import {
  getOrCreateStoredRegistrationId,
  getStoredDeviceRegistration,
  setStoredDeviceRegistration,
  type StoredDeviceRegistration,
} from "@/lib/browser-trust-store";
import { createAuthRealtimeRuntime } from "@/lib/auth-realtime-runtime";
import { setSessionAccessToken } from "@/lib/session";
import { logger } from "@/lib/logger.js";
import {
  clearLegacyLockSnapshotStorage,
  clearPin,
  hasPinSet,
  setPinHash,
  verifyPin,
} from "@/lib/app-lock-password";
import { useMessagesStore } from "@/stores/messages";
import { useGroupsStore } from "@/stores/groups";
import { usePlainMessagesStore, usePlainGroupsStore, usePlainPinsStore } from "@/stores/plain";
import { clearPlainAttachmentBlobCache } from "@/chats/runtime/plain-attachment-blob-cache";
import type { AuthState } from "./auth-types";
import {
  buildLockedState,
  buildReadyState,
  buildRecoveryRequiredState,
  buildSignedOutState,
} from "./auth-state-builders";
import {
  clearRatchetSessions,
  resolveRestoredSession,
  revokeServerSession,
  wipeLocalDeviceMaterial,
} from "./auth-session-restore";
import { isNativePlatform } from "@/lib/native-platform";
import { nativeStorageSet, nativeStorageRemove } from "@/lib/native-storage";

export type { AuthLifecycleState, AuthRecoveryReason, AuthState } from "./auth-types";

const BACKGROUND_POLL_TOKEN_KEY = "sc:background_poll_token";

async function fetchAndStoreBackgroundToken(): Promise<void> {
  if (!isNativePlatform()) return;
  try {
    const { token } = await api.post<{ token: string }>("/auth/background-token");
    await nativeStorageSet(BACKGROUND_POLL_TOKEN_KEY, token);
  } catch {
    // Non-critical — background runner just won't work until next login.
  }
}

const OTK_BATCH_SIZE = 100;

function suspendRealtimeSession(source: string): void {
  authRealtimeRuntime.suspend(source);
  setSessionAccessToken(null);
}

function clearEphemeralRuntimeState(): void {
  useMessagesStore.getState().reset();
  useGroupsStore.getState().reset();
  usePlainMessagesStore.getState().reset();
  usePlainGroupsStore.getState().reset();
  usePlainPinsStore.getState().reset();
  clearPlainAttachmentBlobCache();
}

async function clearLocalSessionSecrets(params: {
  storageKey: CryptoKey | null;
  teardownReason: string;
  clearPinMaterial: boolean;
}): Promise<void> {
  await authRealtimeRuntime.teardown(params.teardownReason);
  await revokeServerSession();
  setSessionAccessToken(null);
  await wipeLocalDeviceMaterial(params);
  clearEphemeralRuntimeState();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  userId: null,
  deviceId: null,
  username: null,
  accessToken: null,
  identityDhKeyPair: null,
  storageKey: null,
  storageKeyVolatile: false,
  authLifecycle: "restoring",
  authRecoveryReason: null,
  authOperation: "idle",
  error: null,
  pinEnabled: false,
  cryptoReady: false,

  register: async (username, password, deviceName) => {
    set({ error: null, authRecoveryReason: null, authOperation: "idle" });
    try {
      const { key: storageKey, volatile: storageKeyVolatile } = await getOrCreateStorageKey();

      const identity = await generateIdentityBundle();
      const registrationId = await getOrCreateStoredRegistrationId(storageKey);
      const spkId = 1;
      const spk = await generateSignedPreKey(spkId, identity.signingKeyPair.privateKey);
      const otks = await generateOneTimePreKeys(1, OTK_BATCH_SIZE);

      const result = await api.post<RegisterResponse>("/auth/register", {
        version: AUTH_PROTOCOL_VERSION,
        username,
        password,
        device: {
          name: deviceName,
          identityKeyPublic: toBase64Url(identity.dhKeyPair.publicKey),
          signingKeyPublic: toBase64Url(identity.signingKeyPair.publicKey),
          registrationId,
          signedPreKey: {
            id: spkId,
            publicKey: toBase64Url(spk.publicKey),
            signature: toBase64Url(spk.signature),
          },
          oneTimePreKeys: otks.map(otk => ({
            id: otk.id,
            publicKey: toBase64Url(otk.publicKey),
          })),
        },
      });

      const otkPrivateKeys: Record<number, string> = {};
      for (const otk of otks) {
        otkPrivateKeys[otk.id] = toBase64Url(otk.privateKey);
      }
      const deviceKeys: StoredDeviceKeys = {
        dhPrivateKey: toBase64Url(identity.dhKeyPair.privateKey),
        dhPublicKey: toBase64Url(identity.dhKeyPair.publicKey),
        signingPrivateKey: toBase64Url(identity.signingKeyPair.privateKey),
        signingPublicKey: toBase64Url(identity.signingKeyPair.publicKey),
        signedPreKeyPriv: toBase64Url(spk.privateKey),
        signedPreKeyPub: toBase64Url(spk.publicKey),
        signedPreKeySig: toBase64Url(spk.signature),
        signedPreKeyId: spkId,
        otkPrivateKeys,
      };
      await storeEncrypted(storageKey, `device:${result.deviceId}:keys`, deviceKeys);

      const regRecord: StoredDeviceRegistration = {
        deviceId: result.deviceId,
        registrationId,
        spkId,
      };
      await setStoredDeviceRegistration(username, regRecord, storageKey);
      markCurrentDeviceCryptoMaterialSynced(
        toCurrentDeviceCryptoMaterial({
          userId: result.userId,
          deviceId: result.deviceId,
          deviceKeys,
        })
      );

      setSessionAccessToken(result.accessToken);
      clearLegacyLockSnapshotStorage();
      set(buildReadyState({
        userId: result.userId,
        deviceId: result.deviceId,
        username,
        accessToken: result.accessToken,
        identityDhKeyPair: identity.dhKeyPair,
        storageKey,
        storageKeyVolatile,
        cryptoSyncReady: true,
      }));
      authRealtimeRuntime.activate(result.accessToken, "register");
      void fetchAndStoreBackgroundToken();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Registration failed" });
      throw err;
    }
  },

  login: async (username, password, deviceName) => {
    set({ error: null, authRecoveryReason: null, authOperation: "idle" });
    try {
      const { key: storageKey, volatile: storageKeyVolatile } = await getOrCreateStorageKey();

      // ── Reuse path: same browser / same username ───────────────────────────
      // If we have a saved device registration for this username with complete
      // keys in IDB, reuse the same identity. This is critical for E2EE
      // continuity: senders who already have our public keys will use OTKs
      // that we generated in a prior session. Regenerating the identity each
      // login destroys the private halves → X3DH fails on the receiver side.
      const savedReg = await getStoredDeviceRegistration(username, storageKey);
      if (savedReg) {
        const existingKeys = await loadDecrypted<StoredDeviceKeys>(
          storageKey,
          `device:${savedReg.deviceId}:keys`
        );

        if (!hasUsableDeviceKeys(existingKeys)) {
          throw new Error(
            "Local secure keys for this device are missing. Use recovery to reset local secure data and sign in again."
          );
        }

        const normalized = await normalizeStoredDeviceKeys(existingKeys);
        const normalizedKeys = normalized.deviceKeys;

        // Generate fresh OTKs to top-up the server pool.
        // Use IDs beyond the existing range to avoid collisions.
        const existingOtkIds = Object.keys(normalizedKeys.otkPrivateKeys).map(Number);
        const maxOtkId = existingOtkIds.length > 0 ? Math.max(...existingOtkIds) : 0;
        const newOtkStartId = maxOtkId + 1000;
        const topupOtks = await generateOneTimePreKeys(newOtkStartId, OTK_BATCH_SIZE);

        const result = await api.post<LoginResponse>("/auth/login", {
          version: AUTH_PROTOCOL_VERSION,
          username,
          password,
          device: {
            name: deviceName,
            identityKeyPublic: normalizedKeys.dhPublicKey!,
            signingKeyPublic: normalizedKeys.signingPublicKey!,
            registrationId: savedReg.registrationId,
            signedPreKey: {
              id: normalizedKeys.signedPreKeyId,
              publicKey: normalizedKeys.signedPreKeyPub!,
              signature: normalizedKeys.signedPreKeySig!,
            },
            oneTimePreKeys: topupOtks.map(otk => ({
              id: otk.id,
              publicKey: toBase64Url(otk.publicKey),
            })),
          },
        });

        await clearRatchetSessions("login");

        for (const otk of topupOtks) {
          normalizedKeys.otkPrivateKeys[otk.id] = toBase64Url(otk.privateKey);
        }
        await storeEncrypted(storageKey, `device:${result.deviceId}:keys`, normalizedKeys);
        markCurrentDeviceCryptoMaterialSynced(
          toCurrentDeviceCryptoMaterial({
            userId: result.userId,
            deviceId: result.deviceId,
            deviceKeys: normalizedKeys,
          })
        );

        setSessionAccessToken(result.accessToken);
        clearLegacyLockSnapshotStorage();
        set(buildReadyState({
          userId: result.userId,
          deviceId: result.deviceId,
          username: result.user.username,
          accessToken: result.accessToken,
          identityDhKeyPair: normalized.identityDhKeyPair,
          storageKey,
          storageKeyVolatile,
          cryptoSyncReady: true,
        }));
        authRealtimeRuntime.activate(result.accessToken, "login-reuse");
        return;
      }

      // ── Fresh path: first login on this browser, or IDB was cleared ────────
      const identity = await generateIdentityBundle();
      const registrationId = await getOrCreateStoredRegistrationId(storageKey);
      const spkIdBuf = new Uint32Array(1);
      crypto.getRandomValues(spkIdBuf);
      const spkId = (spkIdBuf[0]! % 1000000) + 1;
      const spk = await generateSignedPreKey(spkId, identity.signingKeyPair.privateKey);
      const otks = await generateOneTimePreKeys(spkId * 1000, OTK_BATCH_SIZE);

      const result = await api.post<LoginResponse>("/auth/login", {
        version: AUTH_PROTOCOL_VERSION,
        username,
        password,
        device: {
          name: deviceName,
          identityKeyPublic: toBase64Url(identity.dhKeyPair.publicKey),
          signingKeyPublic: toBase64Url(identity.signingKeyPair.publicKey),
          registrationId,
          signedPreKey: {
            id: spkId,
            publicKey: toBase64Url(spk.publicKey),
            signature: toBase64Url(spk.signature),
          },
          oneTimePreKeys: otks.map(otk => ({
            id: otk.id,
            publicKey: toBase64Url(otk.publicKey),
          })),
        },
      });

      await clearRatchetSessions("login");

      const loginOtkPrivateKeys: Record<number, string> = {};
      for (const otk of otks) {
        loginOtkPrivateKeys[otk.id] = toBase64Url(otk.privateKey);
      }
      const freshDeviceKeys: StoredDeviceKeys = {
        dhPrivateKey: toBase64Url(identity.dhKeyPair.privateKey),
        dhPublicKey: toBase64Url(identity.dhKeyPair.publicKey),
        signingPrivateKey: toBase64Url(identity.signingKeyPair.privateKey),
        signingPublicKey: toBase64Url(identity.signingKeyPair.publicKey),
        signedPreKeyPriv: toBase64Url(spk.privateKey),
        signedPreKeyPub: toBase64Url(spk.publicKey),
        signedPreKeySig: toBase64Url(spk.signature),
        signedPreKeyId: spkId,
        otkPrivateKeys: loginOtkPrivateKeys,
      };
      await storeEncrypted(storageKey, `device:${result.deviceId}:keys`, freshDeviceKeys);

      const regRecord: StoredDeviceRegistration = {
        deviceId: result.deviceId,
        registrationId,
        spkId,
      };
      await setStoredDeviceRegistration(username, regRecord, storageKey);
      markCurrentDeviceCryptoMaterialSynced(
        toCurrentDeviceCryptoMaterial({
          userId: result.userId,
          deviceId: result.deviceId,
          deviceKeys: freshDeviceKeys,
        })
      );

      setSessionAccessToken(result.accessToken);
      clearLegacyLockSnapshotStorage();
      set(buildReadyState({
        userId: result.userId,
        deviceId: result.deviceId,
        username: result.user.username,
        accessToken: result.accessToken,
        identityDhKeyPair: identity.dhKeyPair,
        storageKey,
        storageKeyVolatile,
        cryptoSyncReady: true,
      }));
      authRealtimeRuntime.activate(result.accessToken, "login");
      void fetchAndStoreBackgroundToken();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      console.error("[auth] login failed:", err);
      set({ error: msg });
      throw err;
    }
  },

  tryRestoreSession: async () => {
    set({
      authLifecycle: "restoring",
      authRecoveryReason: null,
      authOperation: "idle",
      error: null,
    });
    try {
      const pinEnabled = await hasPinSet().catch(() => false);

      set({ pinEnabled });
      clearLegacyLockSnapshotStorage();

      const restoreResult = await resolveRestoredSession();

      if (restoreResult.outcome === "signed_out") {
        suspendRealtimeSession("restore-signed-out");
        clearLegacyLockSnapshotStorage();
        set(buildSignedOutState());
        return false;
      }

      if (restoreResult.outcome === "locked") {
        suspendRealtimeSession("restore-locked");
        if (!pinEnabled) {
          set(buildRecoveryRequiredState(
            "unexpected_restore_failure",
            "Session restore found a locked storage key without an active PIN configuration. Reset local device data and sign in again."
          ));
          return false;
        }
        set(buildLockedState(restoreResult.session));
        return false;
      }

      if (restoreResult.outcome === "recovery_required") {
        suspendRealtimeSession("restore-recovery-required");
        clearLegacyLockSnapshotStorage();
        set(buildRecoveryRequiredState(
          restoreResult.reason,
          restoreResult.error
        ));
        return false;
      }

      setSessionAccessToken(restoreResult.session.accessToken);
      clearLegacyLockSnapshotStorage();
      set(buildReadyState(restoreResult.session));
      authRealtimeRuntime.activate(restoreResult.session.accessToken, "session-restore");

      return true;
    } catch (err) {
      logger.warn("[auth] unexpected error during session restore", err);
      suspendRealtimeSession("restore-error");
      set(buildRecoveryRequiredState(
        "unexpected_restore_failure",
        "Session restore failed unexpectedly. Use recovery to clear local secure data or sign in again."
      ));
      return false;
    }
  },

  lock: async () => {
    const state = get();
    if (
      state.authLifecycle !== "ready" ||
      !state.pinEnabled ||
      !state.userId ||
      !state.deviceId
    ) {
      return;
    }

    clearLegacyLockSnapshotStorage();
    suspendRealtimeSession("lock");
    // Clear crypto key material and decrypted message data from memory.
    // This ensures sensitive message content is wiped from RAM on lock,
    // providing data protection — not just a UI barrier.
    useMessagesStore.getState().reset();
    useGroupsStore.getState().reset();
    set({
      accessToken: null,
      identityDhKeyPair: null,
      storageKey: null,
      authLifecycle: "locked",
      authRecoveryReason: null,
      authOperation: "idle",
      error: null,
    });

    if (state.storageKey) {
      try {
        await lockPersistedStorageKey();
      } catch (err) {
        logger.error("[auth] failed to persist locked storage key state", err);
        await clearLocalSessionSecrets({
          storageKey: state.storageKey,
          teardownReason: "lock-storage-key-failure",
          clearPinMaterial: true,
        });
        set({ ...buildSignedOutState(), pinEnabled: false });
      }
    }
  },

  unlock: async (pin?: string) => {
    if (get().authLifecycle !== "locked") {
      return get().authLifecycle === "ready";
    }

    // If a PIN is set, verify it before restoring the session.
    if (get().pinEnabled) {
      if (!pin) {
        set({ error: "pin_required" });
        return false;
      }
      const pinOk = await verifyPin(pin).catch(() => false);
      if (!pinOk) {
        set({ error: "pin_wrong" });
        return false;
      }
    }

    set({ authOperation: "unlocking", authRecoveryReason: null, error: null });

    try {
      const resolvedStorageKey = get().pinEnabled
        ? await unlockPersistedStorageKey(pin!)
        : null;
      const restoreResult = await resolveRestoredSession(resolvedStorageKey);

      if (restoreResult.outcome === "signed_out") {
        suspendRealtimeSession("unlock-signed-out");
        clearLegacyLockSnapshotStorage();
        set(buildSignedOutState());
        return false;
      }

      if (restoreResult.outcome === "recovery_required") {
        suspendRealtimeSession("unlock-recovery-required");
        clearLegacyLockSnapshotStorage();
        set(buildRecoveryRequiredState(
          restoreResult.reason,
          restoreResult.error
        ));
        return false;
      }

      if (restoreResult.outcome === "locked") {
        suspendRealtimeSession("unlock-locked");
        set(buildRecoveryRequiredState(
          "unexpected_restore_failure",
          "Session unlock returned to the locked state unexpectedly. Reset local device data and sign in again."
        ));
        return false;
      }

      setSessionAccessToken(restoreResult.session.accessToken);
      clearLegacyLockSnapshotStorage();
      set(buildReadyState(restoreResult.session));
      authRealtimeRuntime.activate(restoreResult.session.accessToken, "unlock");
      return true;
    } catch (err) {
      logger.warn("[auth] unexpected error during unlock", err);
      suspendRealtimeSession("unlock-error");
      set(buildRecoveryRequiredState(
        "unexpected_restore_failure",
        "Session restore failed unexpectedly. Use recovery to clear local secure data or sign in again."
      ));
      return false;
    }
  },

  setPin: async (pin) => {
    const state = get();
    if (state.authLifecycle !== "ready" || !state.storageKey) {
      throw new Error("pin_requires_active_session");
    }
    const {
      key: exportableStorageKey,
      volatile: storageKeyVolatile,
    } = await ensureExportableStorageKey(state.storageKey);
    await protectPersistedStorageKeyWithPin(exportableStorageKey, pin);
    await setPinHash(pin);
    set({
      pinEnabled: true,
      storageKey: exportableStorageKey,
      storageKeyVolatile,
    });
  },

  removePin: async () => {
    const state = get();
    if (state.storageKey) {
      await removeStorageKeyPinProtection(state.storageKey);
    }
    await clearPin();
    clearLegacyLockSnapshotStorage();
    set({ pinEnabled: false });
  },

  logout: async () => {
    void nativeStorageRemove(BACKGROUND_POLL_TOKEN_KEY);
    await clearLocalSessionSecrets({
      storageKey: get().storageKey,
      teardownReason: "logout",
      clearPinMaterial: true,
    });
    set({ ...buildSignedOutState(), pinEnabled: false });
  },

  resetLocalDeviceData: async () => {
    await clearLocalSessionSecrets({
      storageKey: get().storageKey,
      teardownReason: "recovery-reset",
      clearPinMaterial: true,
    });
    set({ ...buildSignedOutState(), pinEnabled: false });
  },

  clearError: () => set({ error: null }),
}));

const authRealtimeRuntime = createAuthRealtimeRuntime({
  onAccessTokenRefreshed: (accessToken) => {
    useAuthStore.setState({ accessToken });
  },
  onSessionRefreshFailed: () => {
    // Session cookie expired or server rejected the refresh.  Suspend the WS
    // and move to signed_out WITHOUT touching IDB — device E2EE key material
    // must never be wiped on a transient network failure.  The user can
    // re-authenticate and resume from existing keys (reuse path in login()).
    suspendRealtimeSession("session-refresh-failed");
    clearEphemeralRuntimeState();
    useAuthStore.setState({ ...buildSignedOutState(), pinEnabled: false });
  },
});

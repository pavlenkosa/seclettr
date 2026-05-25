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
import { AUTH_ERROR_CODES } from "@/lib/auth-error-codes";
import {
  clearLegacyStorageKeyStorage,
  clearPersistedStorageKey,
  ensureExportableStorageKey,
  getOrCreateStorageKey,
  lockPersistedStorageKey,
  protectPersistedStorageKeyWithPin,
  removeStorageKeyPinProtection,
  unlockPersistedStorageKey,
} from "@/lib/storage-key";
import { createAuthRealtimeRuntime } from "@/lib/auth-realtime-runtime";
import { setSessionAccessToken } from "@/lib/session";
import { logger } from "@/lib/logger.js";
import {
  clearLegacyLockSnapshotStorage,
  clearPin,
  hasPinSet,
  setBiometricEnabledFlag,
  setPinHash,
  verifyPin,
} from "@/lib/app-lock-password";
import type { AuthState } from "./auth-types";
import {
  buildLockedState,
  buildReadyState,
  buildRecoveryRequiredState,
  buildSignedOutState,
} from "./auth-state-builders";
import {
  resolveRestoredSession,
  revokeServerSession,
  wipeLocalDeviceMaterial,
} from "./auth-session-restore";
import { nativeStorageRemove } from "@/lib/native-storage";
import { storePinBiometric, clearPinBiometric } from "@/lib/native-biometric";
import {
  onNativePushAuthFailure,
  startNativePushService,
  stopNativePushService,
  updateNativePushToken,
} from "@/lib/native-notifications";
import { refreshSessionAccessToken } from "@/lib/session";

export type { AuthLifecycleState, AuthRecoveryReason, AuthState } from "./auth-types";

const BACKGROUND_POLL_TOKEN_KEY = "sc:background_poll_token";

function suspendRealtimeSession(source: string): void {
  authRealtimeRuntime.suspend(source);
  setSessionAccessToken(null);
}

async function clearEphemeralRuntimeState(): Promise<void> {
  const { clearFullRuntimeState } = await import("./auth-runtime-reset");
  clearFullRuntimeState();
}

async function clearEncryptedRuntimeState(): Promise<void> {
  const { clearEncryptedRuntimeState: clearEncryptedState } = await import("./auth-runtime-reset");
  clearEncryptedState();
}

/**
 * Get or create the storage key for a fresh credential-based auth flow
 * (login / register).  If a PIN-locked key from a previous session is found,
 * wipe it so the fresh credential flow can proceed — the user is explicitly
 * re-authenticating and will re-establish local device material.
 */
async function getOrCreateStorageKeyForAuth(): Promise<{ key: CryptoKey; volatile: boolean }> {
  try {
    return await getOrCreateStorageKey();
  } catch (err) {
    if (err instanceof Error && err.message === "storage_key_locked") {
      logger.warn("[auth] locked storage key found during credential login — clearing to allow fresh start");
      await clearPersistedStorageKey();
      clearLegacyStorageKeyStorage();
      return getOrCreateStorageKey();
    }
    throw err;
  }
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
  await clearEphemeralRuntimeState();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  userId: null,
  deviceId: null,
  username: null,
  displayName: null,
  bio: null,
  avatarKey: null,
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
      const { key: storageKey, volatile: storageKeyVolatile } = await getOrCreateStorageKeyForAuth();
      const authCredentialRuntime = await import("./auth-login-register-runtime");
      const result = await authCredentialRuntime.runRegisterFlow({
        username,
        password,
        deviceName,
        storageKey,
        storageKeyVolatile,
      });

      setSessionAccessToken(result.session.accessToken);
      clearLegacyLockSnapshotStorage();
      set(buildReadyState(result.session));
      authRealtimeRuntime.activate(result.session.accessToken, result.activationReason);
      if (result.shouldFetchBackgroundToken) {
        void authCredentialRuntime.fetchAndStoreBackgroundToken();
      }
      void startNativePushService(result.session.accessToken);
    } catch (err) {
      set({
        error:
          err instanceof Error
            ? err.message
            : AUTH_ERROR_CODES.registrationFailed,
      });
      throw err;
    }
  },

  login: async (username, password, deviceName) => {
    set({ error: null, authRecoveryReason: null, authOperation: "idle" });
    try {
      const { key: storageKey, volatile: storageKeyVolatile } = await getOrCreateStorageKeyForAuth();
      const authCredentialRuntime = await import("./auth-login-register-runtime");
      const result = await authCredentialRuntime.runLoginFlow({
        username,
        password,
        deviceName,
        storageKey,
        storageKeyVolatile,
      });

      setSessionAccessToken(result.session.accessToken);
      clearLegacyLockSnapshotStorage();
      set(buildReadyState(result.session));
      authRealtimeRuntime.activate(result.session.accessToken, result.activationReason);
      if (result.shouldFetchBackgroundToken) {
        void authCredentialRuntime.fetchAndStoreBackgroundToken();
      }
      void startNativePushService(result.session.accessToken);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : AUTH_ERROR_CODES.loginFailed;
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
            AUTH_ERROR_CODES.restoreUnexpected
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
          restoreResult.errorCode
        ));
        return false;
      }

      setSessionAccessToken(restoreResult.session.accessToken);
      clearLegacyLockSnapshotStorage();
      set(buildReadyState(restoreResult.session));
      authRealtimeRuntime.activate(restoreResult.session.accessToken, "session-restore");
      void startNativePushService(restoreResult.session.accessToken);

      return true;
    } catch (err) {
      logger.warn("[auth] unexpected error during session restore", err);
      suspendRealtimeSession("restore-error");
      set(buildRecoveryRequiredState(
        "unexpected_restore_failure",
        AUTH_ERROR_CODES.restoreUnexpected
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
    await clearEncryptedRuntimeState();
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
          restoreResult.errorCode
        ));
        return false;
      }

      if (restoreResult.outcome === "locked") {
        suspendRealtimeSession("unlock-locked");
        set(buildRecoveryRequiredState(
          "unexpected_restore_failure",
          AUTH_ERROR_CODES.restoreUnexpected
        ));
        return false;
      }

      setSessionAccessToken(restoreResult.session.accessToken);
      clearLegacyLockSnapshotStorage();
      set(buildReadyState(restoreResult.session));
      authRealtimeRuntime.activate(restoreResult.session.accessToken, "unlock");
      void startNativePushService(restoreResult.session.accessToken);
      return true;
    } catch (err) {
      logger.warn("[auth] unexpected error during unlock", err);
      suspendRealtimeSession("unlock-error");
      set(buildRecoveryRequiredState(
        "unexpected_restore_failure",
        AUTH_ERROR_CODES.restoreUnexpected
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
    // Store PIN in biometric secure enclave so FaceID/TouchID/Fingerprint can retrieve it.
    // Await the result: only mark biometric as enabled if the credential was actually stored.
    const biometricStored = await storePinBiometric(pin).catch(() => false);
    setBiometricEnabledFlag(biometricStored);
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
    void clearPinBiometric();
    setBiometricEnabledFlag(false);
    set({ pinEnabled: false });
  },

  logout: async () => {
    void nativeStorageRemove(BACKGROUND_POLL_TOKEN_KEY);
    void stopNativePushService();
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

  applyProfileUpdate: (patch) => {
    const updates: Partial<AuthState> = {};
    if ("displayName" in patch) updates.displayName = patch.displayName ?? null;
    if ("bio" in patch) updates.bio = patch.bio ?? null;
    if ("avatarKey" in patch) updates.avatarKey = patch.avatarKey ?? null;
    set(updates);
  },
}));

const authRealtimeRuntime = createAuthRealtimeRuntime({
  onAccessTokenRefreshed: (accessToken) => {
    useAuthStore.setState({ accessToken });
    void updateNativePushToken(accessToken);
  },
  onSessionRefreshFailed: async () => {
    // Session cookie expired or server rejected the refresh.  Suspend the WS
    // and move to signed_out WITHOUT touching IDB — device E2EE key material
    // must never be wiped on a transient network failure.  The user can
    // re-authenticate and resume from existing keys (reuse path in login()).
    suspendRealtimeSession("session-refresh-failed");
    void stopNativePushService();
    try {
      await clearEphemeralRuntimeState();
    } catch (error) {
      logger.error("[auth] failed to clear runtime state after session refresh failure", error);
    }
    useAuthStore.setState({ ...buildSignedOutState(), pinEnabled: false });
  },
});

// When the background push foreground-service's WS token expires (4001),
// the service emits "pushAuthFailure". Refresh the session and hand the
// service a fresh token so it can reconnect without waiting 30 s.
void onNativePushAuthFailure(async () => {
  const state = useAuthStore.getState();
  if (state.authLifecycle !== "ready") return;
  try {
    const token = await refreshSessionAccessToken();
    if (token) {
      void updateNativePushToken(token);
    }
  } catch {
    // Network error — service will retry on its own schedule.
  }
});

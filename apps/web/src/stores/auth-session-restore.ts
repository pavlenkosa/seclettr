import {
  clearEncryptedByPrefix,
  loadDecrypted,
  storeEncrypted,
} from "@seclettr/crypto";
import {
  type StoredDeviceKeys,
  hasUsableDeviceKeys,
  normalizeStoredDeviceKeys,
  toCurrentDeviceCryptoMaterial,
} from "./auth-device-keys";
import { api } from "@/lib/api";
import {
  clearBrowserTrustStore,
  clearBrowserTrustStoreCache,
} from "@/lib/browser-trust-store";
import {
  clearCurrentDeviceCryptoMaterialSyncCache,
  ensureCurrentDeviceCryptoMaterialSynced,
} from "@/lib/current-device-crypto-material";
import {
  clearLegacyStorageKeyStorage,
  clearPersistedStorageKey,
  getOrCreateStorageKey,
} from "@/lib/storage-key";
import {
  clearLegacyLockSnapshotStorage,
  clearPin,
} from "@/lib/app-lock-password";
import { refreshSessionAccessToken } from "@/lib/session";
import { previewRefreshSession } from "@/lib/session-preview";
import { requestPersistentStorage, checkStorageQuota } from "@/lib/storage-health";
import { logger } from "@/lib/logger.js";
import type { RestoreSessionResult } from "./auth-types";

const SESSION_KEY_PREFIX = "session:";
const SESSION_MIGRATION_FLAG = "seclettr.sessionMigration.v1";

export async function clearRatchetSessions(reason: string): Promise<void> {
  const removed = await clearEncryptedByPrefix(SESSION_KEY_PREFIX);
  if (removed > 0) {
    logger.info(`[auth] cleared ${removed} ratchet sessions (${reason})`);
  }
}

export async function revokeServerSession(): Promise<void> {
  await api.post("/auth/logout").catch(() => null);
}

export async function wipeLocalDeviceMaterial(params: {
  storageKey: CryptoKey | null;
  teardownReason: string;
  clearPinMaterial: boolean;
}): Promise<void> {
  clearBrowserTrustStoreCache();
  clearCurrentDeviceCryptoMaterialSyncCache();
  await clearEncryptedByPrefix("device:");
  await clearRatchetSessions(params.teardownReason);
  await clearBrowserTrustStore(params.storageKey);
  clearLegacyStorageKeyStorage();
  await clearPersistedStorageKey();
  clearLegacyLockSnapshotStorage();
  if (params.clearPinMaterial) {
    await clearPin().catch(() => null);
  }
}

export function parseSessionIdentity(
  accessToken: string
): { userId: string; deviceId: string } {
  const payload = JSON.parse(
    atob(accessToken.split(".")[1]!.replaceAll("-", "+").replaceAll("_", "/"))
  ) as { sub: string; deviceId: string };
  return { userId: payload.sub, deviceId: payload.deviceId };
}

async function runSessionMigrationOnce(): Promise<void> {
  if (localStorage.getItem(SESSION_MIGRATION_FLAG) === "1") return;
  localStorage.setItem(SESSION_MIGRATION_FLAG, "1");
}

export async function resolveRestoredSession(
  providedStorageKey?: { key: CryptoKey; volatile: boolean } | null
): Promise<RestoreSessionResult> {
  const sessionPreview = await previewRefreshSession();
  if (!sessionPreview) {
    return { outcome: "signed_out" };
  }

  // Request that the browser never evict this origin's IDB under quota
  // pressure.  Fire-and-forget — result logged inside, never blocks restore.
  void requestPersistentStorage();
  // Warn in logs if storage is getting full (>75 % quota used).
  void checkStorageQuota();

  let resolvedStorageKey = providedStorageKey ?? null;
  if (!resolvedStorageKey) {
    try {
      resolvedStorageKey = await getOrCreateStorageKey();
    } catch (error) {
      if (error instanceof Error && error.message === "storage_key_locked") {
        return {
          outcome: "locked",
          session: {
            userId: sessionPreview.userId,
            deviceId: sessionPreview.deviceId,
            username: sessionPreview.username,
          },
        };
      }
      throw error;
    }
  }

  const { key: storageKey, volatile: storageKeyVolatile } = resolvedStorageKey;
  await runSessionMigrationOnce();
  const deviceKeys = await loadDecrypted<StoredDeviceKeys>(
    storageKey,
    `device:${sessionPreview.deviceId}:keys`
  );

  if (!hasUsableDeviceKeys(deviceKeys)) {
    return {
      outcome: "recovery_required",
      reason: "missing_local_keys",
      error: "Local E2EE keys are missing for this device. Sign in again to re-provision keys.",
    };
  }

  const normalized = await normalizeStoredDeviceKeys(deviceKeys);
  await storeEncrypted(
    storageKey,
    `device:${sessionPreview.deviceId}:keys`,
    normalized.deviceKeys
  );

  const accessToken = await refreshSessionAccessToken();
  if (!accessToken) {
    return { outcome: "signed_out" };
  }

  const sessionIdentity = parseSessionIdentity(accessToken);
  if (
    sessionIdentity.userId !== sessionPreview.userId ||
    sessionIdentity.deviceId !== sessionPreview.deviceId
  ) {
    logger.warn("[auth] refresh session identity changed during restore", {
      previewUserId: sessionPreview.userId,
      previewDeviceId: sessionPreview.deviceId,
      refreshedUserId: sessionIdentity.userId,
      refreshedDeviceId: sessionIdentity.deviceId,
    });
    return {
      outcome: "recovery_required",
      reason: "unexpected_restore_failure",
      error: "Session identity changed during restore. Sign in again to verify this device.",
    };
  }

  const currentDeviceCryptoMaterial = toCurrentDeviceCryptoMaterial({
    userId: sessionIdentity.userId,
    deviceId: sessionIdentity.deviceId,
    deviceKeys: normalized.deviceKeys,
  });
  const cryptoMaterialSynced = await ensureCurrentDeviceCryptoMaterialSynced(
    currentDeviceCryptoMaterial,
    { logScope: "auth.restore" }
  );
  if (!cryptoMaterialSynced) {
    logger.warn(
      "[auth] restore continued without confirmed current-device crypto sync — cryptoReady=false"
    );
  }

  const me = await api.getMeUser();

  return {
    outcome: "ready",
    session: {
      userId: sessionIdentity.userId,
      deviceId: sessionIdentity.deviceId,
      username: me?.username ?? sessionPreview.username,
      accessToken,
      identityDhKeyPair: normalized.identityDhKeyPair,
      storageKey,
      storageKeyVolatile,
      cryptoSyncReady: cryptoMaterialSynced,
    },
  };
}

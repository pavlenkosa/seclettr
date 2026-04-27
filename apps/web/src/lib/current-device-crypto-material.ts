import { api } from "./api";
import { logger } from "./logger.js";

export interface CurrentDeviceCryptoMaterial {
  userId: string;
  deviceId: string;
  identityKeyPublic: string;
  signingKeyPublic: string;
  signedPreKey: {
    id: number;
    publicKey: string;
    signature: string;
  };
}

const currentDeviceCryptoMaterialSyncCache = new Map<string, string>();
const currentDeviceCryptoMaterialSyncInFlight = new Map<string, Promise<void>>();

function buildCurrentDeviceCryptoMaterialCacheKey(
  material: Pick<CurrentDeviceCryptoMaterial, "userId" | "deviceId">
): string {
  return `${material.userId}:${material.deviceId}`;
}

function serializeCurrentDeviceCryptoMaterial(
  material: Omit<CurrentDeviceCryptoMaterial, "userId" | "deviceId">
): string {
  return JSON.stringify({
    identityKeyPublic: material.identityKeyPublic,
    signingKeyPublic: material.signingKeyPublic,
    signedPreKey: material.signedPreKey,
  });
}

export function markCurrentDeviceCryptoMaterialSynced(
  material: CurrentDeviceCryptoMaterial
): void {
  currentDeviceCryptoMaterialSyncCache.set(
    buildCurrentDeviceCryptoMaterialCacheKey(material),
    serializeCurrentDeviceCryptoMaterial(material)
  );
}

export async function ensureCurrentDeviceCryptoMaterialSynced(
  material: CurrentDeviceCryptoMaterial,
  options?: {
    logScope?: string;
  }
): Promise<boolean> {
  const cacheKey = buildCurrentDeviceCryptoMaterialCacheKey(material);
  const materialFingerprint = serializeCurrentDeviceCryptoMaterial(material);
  if (currentDeviceCryptoMaterialSyncCache.get(cacheKey) === materialFingerprint) {
    return true;
  }

  const existingSync = currentDeviceCryptoMaterialSyncInFlight.get(cacheKey);
  if (existingSync) {
    try {
      await existingSync;
    } catch {
      // The originating request will log the failure.
    }
    return currentDeviceCryptoMaterialSyncCache.get(cacheKey) === materialFingerprint;
  }

  const logScope = options?.logScope ?? "current-device-crypto";
  const syncPromise = (async () => {
    logger.warn(`[${logScope}] syncing current device crypto material`, {
      userId: material.userId,
      deviceId: material.deviceId,
    });

    await api.syncCurrentDeviceCryptoMaterial({
      identityKeyPublic: material.identityKeyPublic,
      signingKeyPublic: material.signingKeyPublic,
      signedPreKey: material.signedPreKey,
    });
    currentDeviceCryptoMaterialSyncCache.set(cacheKey, materialFingerprint);
  })();

  currentDeviceCryptoMaterialSyncInFlight.set(cacheKey, syncPromise);
  try {
    await syncPromise;
    return currentDeviceCryptoMaterialSyncCache.get(cacheKey) === materialFingerprint;
  } catch (err) {
    currentDeviceCryptoMaterialSyncCache.delete(cacheKey);
    logger.error(`[${logScope}] ensureCurrentDeviceCryptoMaterialSynced failed`, {
      userId: material.userId,
      deviceId: material.deviceId,
      err,
    });
    return false;
  } finally {
    currentDeviceCryptoMaterialSyncInFlight.delete(cacheKey);
  }
}

export function clearCurrentDeviceCryptoMaterialSyncCache(): void {
  currentDeviceCryptoMaterialSyncCache.clear();
  currentDeviceCryptoMaterialSyncInFlight.clear();
}

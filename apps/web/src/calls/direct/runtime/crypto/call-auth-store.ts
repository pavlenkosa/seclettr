import {
  fromBase64Url,
  loadDecrypted,
  restoreKeyPairFromPrivateKey,
  restoreSigningKeyPairFromPrivateKey,
  signPublicKey,
  toBase64Url,
} from "@seclettr/crypto";
import {
  clearCurrentDeviceCryptoMaterialSyncCache,
  ensureCurrentDeviceCryptoMaterialSynced,
} from "@/lib/current-device-crypto-material";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger.js";
import { useAuthStore } from "@/stores/auth";
import type {
  CachedPeerDevicePublicKeys,
  CurrentDeviceCallAuthSigner,
  StoredDeviceCallAuthKeys,
} from "./call-auth-material";

// LRU size cap: prevents unbounded growth in long sessions with many distinct peers.
// Public keys are cached to avoid repeated directory fetches within a single call.
const MAX_PEER_DEVICE_PUBLIC_KEY_CACHE_ENTRIES = 100;
const peerDevicePublicKeyCache = new Map<string, CachedPeerDevicePublicKeys>();

export function loadAuthStoreState() {
  return useAuthStore.getState();
}

export async function loadCurrentCallAuthSigner(): Promise<CurrentDeviceCallAuthSigner | null> {
  const { storageKey, userId, deviceId } = loadAuthStoreState();
  if (!storageKey || !userId || !deviceId) {
    logger.warn("[call-auth] loadCurrentCallAuthSigner: auth store missing fields", {
      hasStorageKey: !!storageKey,
      hasUserId: !!userId,
      hasDeviceId: !!deviceId,
    });
    return null;
  }

  let stored: StoredDeviceCallAuthKeys | null = null;
  try {
    stored = await loadDecrypted<StoredDeviceCallAuthKeys>(
      storageKey,
      `device:${deviceId}:keys`
    );
  } catch (error) {
    logger.error("[call-auth] loadCurrentCallAuthSigner: IDB read threw", { deviceId, error });
    return null;
  }

  if (
    !stored?.dhPrivateKey ||
    !stored.signingPrivateKey ||
    !stored.signedPreKeyPriv ||
    !Number.isInteger(stored.signedPreKeyId)
  ) {
    logger.warn("[call-auth] loadCurrentCallAuthSigner: IDB entry missing or empty", {
      deviceId,
      hasStored: !!stored,
    });
    return null;
  }

  const identityKeyPair = await restoreKeyPairFromPrivateKey(
    fromBase64Url(stored.dhPrivateKey),
    stored.dhPublicKey ? fromBase64Url(stored.dhPublicKey) : undefined
  );
  const signingKeyPair = await restoreSigningKeyPairFromPrivateKey(
    fromBase64Url(stored.signingPrivateKey),
    stored.signingPublicKey ? fromBase64Url(stored.signingPublicKey) : undefined
  );
  const signedPreKeyPair = await restoreKeyPairFromPrivateKey(
    fromBase64Url(stored.signedPreKeyPriv),
    stored.signedPreKeyPub ? fromBase64Url(stored.signedPreKeyPub) : undefined
  );
  const signedPreKeySignature = stored.signedPreKeySig
    ? stored.signedPreKeySig
    : toBase64Url(
      await signPublicKey(signedPreKeyPair.publicKey, signingKeyPair.privateKey)
    );

  const signer: CurrentDeviceCallAuthSigner = {
    userId,
    deviceId,
    signingPrivateKey: signingKeyPair.privateKey,
    identityKeyPublic: toBase64Url(identityKeyPair.publicKey),
    signingKeyPublic: toBase64Url(signingKeyPair.publicKey),
    signedPreKey: {
      id: stored.signedPreKeyId,
      publicKey: toBase64Url(signedPreKeyPair.publicKey),
      signature: signedPreKeySignature,
    },
  };

  const cryptoMaterialSynced = await ensureCurrentDeviceCryptoMaterialSynced(
    signer,
    { logScope: "call-auth" }
  );
  if (!cryptoMaterialSynced) {
    logger.error("[call-auth] loadCurrentCallAuthSigner: current device crypto material sync failed", {
      userId,
      deviceId,
    });
    return null;
  }

  peerDevicePublicKeyCache.delete(`${userId}:${deviceId}`);
  return signer;
}

async function loadPeerDevicePublicKeys(
  userId: string,
  deviceId: string
): Promise<CachedPeerDevicePublicKeys | null> {
  const cacheKey = `${userId}:${deviceId}`;
  const cached = peerDevicePublicKeyCache.get(cacheKey);
  if (cached) {
    // Refresh recency: move to end of Map insertion order (LRU touch).
    peerDevicePublicKeyCache.delete(cacheKey);
    peerDevicePublicKeyCache.set(cacheKey, cached);
    return cached;
  }

  const directory = await api.getUserDeviceDirectory(userId);
  const device = directory.find((entry) => entry.deviceId === deviceId);
  if (!device) {
    return null;
  }

  const keys: CachedPeerDevicePublicKeys = {
    identityPublicKey: device.identityKeyPublic ? fromBase64Url(device.identityKeyPublic) : null,
    signingPublicKey: device.signingKeyPublic ? fromBase64Url(device.signingKeyPublic) : null,
  };
  peerDevicePublicKeyCache.set(cacheKey, keys);
  // Evict oldest entries while the cache exceeds the size cap.
  while (peerDevicePublicKeyCache.size > MAX_PEER_DEVICE_PUBLIC_KEY_CACHE_ENTRIES) {
    const oldest = peerDevicePublicKeyCache.keys().next().value;
    if (oldest !== undefined) {
      peerDevicePublicKeyCache.delete(oldest);
    }
  }
  return keys;
}

export async function loadPeerSigningPublicKey(
  userId: string,
  deviceId: string
): Promise<Uint8Array | null> {
  const keys = await loadPeerDevicePublicKeys(userId, deviceId);
  return keys?.signingPublicKey ?? null;
}

export async function loadPeerIdentityPublicKey(
  userId: string,
  deviceId: string
): Promise<Uint8Array | null> {
  const keys = await loadPeerDevicePublicKeys(userId, deviceId);
  return keys?.identityPublicKey ?? null;
}

export function clearCallAuthCache(): void {
  peerDevicePublicKeyCache.clear();
  clearCurrentDeviceCryptoMaterialSyncCache();
}

/** @internal Exposed for tests only — do not use in production code. */
export function getPeerDevicePublicKeyCacheSize(): number {
  return peerDevicePublicKeyCache.size;
}

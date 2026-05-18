import {
  clearEncryptedByPrefix,
  loadDecrypted,
  storeEncrypted,
} from "@seclettr/crypto";
import { getOrCreateStorageKey } from "@/lib/storage-key";
import {
  applyDiscoveredIntegrityIssues,
  cloneTrustStore,
  createEmptyTrustStore,
  mergeIntegrityIssues,
  sanitizeTrustStore,
  type BrowserTrustStore,
} from "./browser-trust-store-sanitize";
import { buildMigratedTrustStore } from "./browser-trust-store-migration";

interface BrowserTrustStorePersistenceOptions {
  trustStorePrefix: string;
  trustStoreKey: string;
  registrationIdKey: string;
  deviceRegPrefix: string;
  safetyVerificationPrefix: string;
  peerIdentityCachePrefix: string;
}

interface BrowserTrustStorePersistenceRuntime {
  loadTrustStore: (storageKey?: CryptoKey | null) => Promise<BrowserTrustStore>;
  updateTrustStore: (
    updater: (current: BrowserTrustStore) => BrowserTrustStore,
    storageKey?: CryptoKey | null
  ) => Promise<BrowserTrustStore>;
  clearBrowserTrustStoreCache: () => void;
  clearBrowserTrustStore: (storageKey?: CryptoKey | null) => Promise<void>;
  readCachedPeerIdentityKey: (deviceId: string) => string | null;
  primeCachedPeerIdentityKey: (deviceId: string, identityKey: string) => void;
}

function getBrowserStorage(): Storage | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  return localStorage;
}

function collectLegacyTrustKeys(
  storage: Storage,
  options: Pick<
    BrowserTrustStorePersistenceOptions,
    | "registrationIdKey"
    | "deviceRegPrefix"
    | "safetyVerificationPrefix"
    | "peerIdentityCachePrefix"
  >
): string[] {
  const keysToRemove: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (
      key === options.registrationIdKey ||
      key.startsWith(options.deviceRegPrefix) ||
      key.startsWith(options.safetyVerificationPrefix) ||
      key.startsWith(options.peerIdentityCachePrefix)
    ) {
      keysToRemove.push(key);
    }
  }
  return keysToRemove;
}

function removeLegacyKeys(storage: Storage | null, keys: string[]): void {
  if (!storage) return;
  for (const key of keys) {
    storage.removeItem(key);
  }
}

/**
 * Owns encrypted persistence, in-memory cache, storage-key resolution, and
 * serialized writes for the browser trust-store. It preserves the critical
 * restore -> migrate -> degrade -> persist -> cleanup order.
 */
export function createBrowserTrustStorePersistenceRuntime(
  options: BrowserTrustStorePersistenceOptions
): BrowserTrustStorePersistenceRuntime {
  let cachedTrustStore: BrowserTrustStore | null = null;
  let cachedStorageKey: CryptoKey | null = null;
  let writeQueue: Promise<void> = Promise.resolve();

  async function resolveStorageKey(
    storageKey?: CryptoKey | null
  ): Promise<CryptoKey> {
    if (storageKey) {
      return storageKey;
    }
    const created = await getOrCreateStorageKey();
    return created.key;
  }

  async function queueTrustStoreWrite(
    storageKey: CryptoKey,
    store: BrowserTrustStore
  ): Promise<void> {
    const snapshot = cloneTrustStore(store);
    writeQueue = writeQueue.then(async () => {
      await storeEncrypted(storageKey, options.trustStoreKey, snapshot);
    });
    await writeQueue;
  }

  async function loadTrustStore(
    storageKey?: CryptoKey | null
  ): Promise<BrowserTrustStore> {
    const resolvedStorageKey = await resolveStorageKey(storageKey);
    if (cachedTrustStore && cachedStorageKey === resolvedStorageKey) {
      return cachedTrustStore;
    }

    const restored = sanitizeTrustStore(
      await loadDecrypted<BrowserTrustStore>(
        resolvedStorageKey,
        options.trustStoreKey
      )
    );
    const migrated = buildMigratedTrustStore({
      baseStore: restored.store,
      storage: getBrowserStorage(),
      registrationIdKey: options.registrationIdKey,
      deviceRegPrefix: options.deviceRegPrefix,
      safetyVerificationPrefix: options.safetyVerificationPrefix,
      peerIdentityCachePrefix: options.peerIdentityCachePrefix,
    });
    const degraded = applyDiscoveredIntegrityIssues(
      migrated.store,
      mergeIntegrityIssues(restored.discoveredIssues, migrated.discoveredIssues)
    );

    cachedTrustStore = degraded.store;
    cachedStorageKey = resolvedStorageKey;

    if (migrated.changed || degraded.changed) {
      await queueTrustStoreWrite(resolvedStorageKey, degraded.store);
    }
    if (migrated.keysToRemove.length > 0) {
      removeLegacyKeys(getBrowserStorage(), migrated.keysToRemove);
    }

    return cachedTrustStore;
  }

  async function updateTrustStore(
    updater: (current: BrowserTrustStore) => BrowserTrustStore,
    storageKey?: CryptoKey | null
  ): Promise<BrowserTrustStore> {
    const resolvedStorageKey = await resolveStorageKey(storageKey);
    const current = await loadTrustStore(resolvedStorageKey);
    const next = sanitizeTrustStore(updater(current)).store;
    cachedTrustStore = next;
    cachedStorageKey = resolvedStorageKey;
    await queueTrustStoreWrite(resolvedStorageKey, next);
    return next;
  }

  function clearBrowserTrustStoreCache(): void {
    cachedTrustStore = null;
    cachedStorageKey = null;
  }

  async function clearBrowserTrustStore(
    _storageKey?: CryptoKey | null
  ): Promise<void> {
    await clearEncryptedByPrefix(options.trustStorePrefix);
    clearBrowserTrustStoreCache();

    const storage = getBrowserStorage();
    if (!storage) return;
    removeLegacyKeys(storage, collectLegacyTrustKeys(storage, options));
  }

  function ensureCachedTrustStore(): BrowserTrustStore {
    cachedTrustStore ??= createEmptyTrustStore();
    return cachedTrustStore;
  }

  function readCachedPeerIdentityKey(deviceId: string): string | null {
    return cachedTrustStore?.peerIdentityCacheByDevice[deviceId] ?? null;
  }

  function primeCachedPeerIdentityKey(
    deviceId: string,
    identityKey: string
  ): void {
    const store = ensureCachedTrustStore();
    store.peerIdentityCacheByDevice[deviceId] = identityKey;
  }

  return {
    loadTrustStore,
    updateTrustStore,
    clearBrowserTrustStoreCache,
    clearBrowserTrustStore,
    readCachedPeerIdentityKey,
    primeCachedPeerIdentityKey,
  };
}

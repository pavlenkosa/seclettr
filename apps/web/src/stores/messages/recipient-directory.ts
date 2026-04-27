export interface RecipientDeviceInfo {
  deviceId: string;
  identityKeyPublic: string;
}

export interface RecipientDeviceDirectory {
  ensureDirectRelationship: (recipientUserId: string) => Promise<void>;
  getRecipientDevices: (
    recipientUserId: string,
    options?: { forceRefresh?: boolean }
  ) => Promise<RecipientDeviceInfo[]>;
  getDeliverableRecipientDevices: (
    recipientUserId: string,
    myDeviceId: string
  ) => Promise<RecipientDeviceInfo[]>;
  invalidateRecipientDeviceCache: (recipientUserId: string) => void;
}

interface CreateRecipientDeviceDirectoryOptions {
  getRequesterUserId: () => string | null;
  fetchRecipientDevices: (
    recipientUserId: string
  ) => Promise<Array<{ deviceId: string; identityKeyPublic: string }>>;
  establishDirectRelationship: (recipientUserId: string) => Promise<void>;
  recipientDeviceCacheTtlMs?: number;
  directRelationshipCacheTtlMs?: number;
  now?: () => number;
}

interface RecipientDeviceCacheEntry {
  devices: RecipientDeviceInfo[];
  expiresAt: number;
}

const DEFAULT_RECIPIENT_DEVICE_CACHE_TTL_MS = 15_000;
const DEFAULT_DIRECT_RELATIONSHIP_CACHE_TTL_MS = 30_000;

function sortRecipientDevices<T extends RecipientDeviceInfo>(devices: T[]): T[] {
  return [...devices].sort((left, right) => left.deviceId.localeCompare(right.deviceId));
}

function normalizeRecipientDevices(
  devices: Array<{ deviceId: string; identityKeyPublic: string }>
): RecipientDeviceInfo[] {
  const dedupedDevices = new Map<string, RecipientDeviceInfo>();
  for (const device of devices) {
    if (!device?.deviceId || !device?.identityKeyPublic) continue;
    dedupedDevices.set(device.deviceId, {
      deviceId: device.deviceId,
      identityKeyPublic: device.identityKeyPublic,
    });
  }
  return sortRecipientDevices([...dedupedDevices.values()]);
}

export function createRecipientDeviceDirectory(
  options: CreateRecipientDeviceDirectoryOptions
): RecipientDeviceDirectory {
  const recipientDeviceCache = new Map<string, RecipientDeviceCacheEntry>();
  const recipientDeviceFetchInFlight = new Map<string, Promise<RecipientDeviceInfo[]>>();
  const directRelationshipCache = new Map<string, number>();
  const now = options.now ?? (() => Date.now());
  const recipientDeviceCacheTtlMs =
    options.recipientDeviceCacheTtlMs ?? DEFAULT_RECIPIENT_DEVICE_CACHE_TTL_MS;
  const directRelationshipCacheTtlMs =
    options.directRelationshipCacheTtlMs ?? DEFAULT_DIRECT_RELATIONSHIP_CACHE_TTL_MS;

  const getRecipientDeviceCacheKey = (recipientUserId: string): string => {
    const senderUserId = options.getRequesterUserId() ?? "anonymous";
    return `${senderUserId}:${recipientUserId}`;
  };

  const getDirectRelationshipCacheKey = (recipientUserId: string): string => {
    return `${options.getRequesterUserId() ?? "anonymous"}:${recipientUserId}`;
  };

  const ensureDirectRelationship = async (recipientUserId: string): Promise<void> => {
    const requesterUserId = options.getRequesterUserId();
    if (!requesterUserId || requesterUserId === recipientUserId) return;

    const cacheKey = getDirectRelationshipCacheKey(recipientUserId);
    const cachedUntil = directRelationshipCache.get(cacheKey) ?? 0;
    if (cachedUntil > now()) return;

    await options.establishDirectRelationship(recipientUserId);
    directRelationshipCache.set(cacheKey, now() + directRelationshipCacheTtlMs);
  };

  const getRecipientDevices = async (
    recipientUserId: string,
    requestOptions?: { forceRefresh?: boolean }
  ): Promise<RecipientDeviceInfo[]> => {
    const cacheKey = getRecipientDeviceCacheKey(recipientUserId);
    const currentTime = now();

    if (!requestOptions?.forceRefresh) {
      const cached = recipientDeviceCache.get(cacheKey);
      if (cached && cached.expiresAt > currentTime) {
        return cached.devices;
      }
      const inFlight = recipientDeviceFetchInFlight.get(cacheKey);
      if (inFlight) {
        return inFlight;
      }
    }

    const fetchPromise = options
      .fetchRecipientDevices(recipientUserId)
      .then((devices) => {
        const normalizedDevices = normalizeRecipientDevices(devices);
        recipientDeviceCache.set(cacheKey, {
          devices: normalizedDevices,
          expiresAt: now() + recipientDeviceCacheTtlMs,
        });
        return normalizedDevices;
      })
      .finally(() => {
        const active = recipientDeviceFetchInFlight.get(cacheKey);
        if (active === fetchPromise) {
          recipientDeviceFetchInFlight.delete(cacheKey);
        }
      });

    recipientDeviceFetchInFlight.set(cacheKey, fetchPromise);
    return fetchPromise;
  };

  const invalidateRecipientDeviceCache = (recipientUserId: string): void => {
    const suffix = `:${recipientUserId}`;
    for (const key of recipientDeviceCache.keys()) {
      if (key.endsWith(suffix)) {
        recipientDeviceCache.delete(key);
      }
    }
    for (const key of recipientDeviceFetchInFlight.keys()) {
      if (key.endsWith(suffix)) {
        recipientDeviceFetchInFlight.delete(key);
      }
    }
  };

  const getDeliverableRecipientDevices = async (
    recipientUserId: string,
    myDeviceId: string
  ): Promise<RecipientDeviceInfo[]> => {
    const pickDeliverable = (devices: RecipientDeviceInfo[]) =>
      sortRecipientDevices(devices.filter((device) => device.deviceId !== myDeviceId));

    let deliverableDevices = pickDeliverable(await getRecipientDevices(recipientUserId));
    if (deliverableDevices.length > 0) {
      return deliverableDevices;
    }

    deliverableDevices = pickDeliverable(
      await getRecipientDevices(recipientUserId, { forceRefresh: true })
    );
    return deliverableDevices;
  };

  return {
    ensureDirectRelationship,
    getRecipientDevices,
    getDeliverableRecipientDevices,
    invalidateRecipientDeviceCache,
  };
}

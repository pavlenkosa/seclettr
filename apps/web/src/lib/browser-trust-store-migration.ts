import {
  cloneTrustStore,
  isValidRegistrationId,
  parseSafetyVerificationRecord,
  parseStoredDeviceRegistration,
  type BrowserTrustIntegrityIssue,
  type BrowserTrustStore,
} from "./browser-trust-store-sanitize";

interface BrowserTrustStoreMigrationOptions {
  baseStore: BrowserTrustStore;
  storage: Storage | null;
  registrationIdKey: string;
  deviceRegPrefix: string;
  safetyVerificationPrefix: string;
  peerIdentityCachePrefix: string;
}

interface BrowserTrustStoreMigrationResult {
  store: BrowserTrustStore;
  keysToRemove: string[];
  changed: boolean;
  discoveredIssues: BrowserTrustIntegrityIssue[];
}

function parseLegacyJson(raw: string | null): unknown {
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function migrateLegacyDeviceRegistration(
  key: string,
  storage: Storage,
  nextStore: BrowserTrustStore,
  discoveredIssues: Set<BrowserTrustIntegrityIssue>,
  keysToRemove: string[],
  deviceRegPrefix: string
): boolean {
  const username = key.slice(deviceRegPrefix.length);
  const parsed = parseStoredDeviceRegistration(
    parseLegacyJson(storage.getItem(key))
  );
  keysToRemove.push(key);
  if (
    username &&
    parsed &&
    nextStore.deviceRegistrationsByUsername[username] === undefined
  ) {
    nextStore.deviceRegistrationsByUsername[username] = parsed;
    return true;
  }
  if (!parsed) discoveredIssues.add("legacy_device_registration_invalid");
  return false;
}

function migrateLegacySafetyVerification(
  key: string,
  storage: Storage,
  nextStore: BrowserTrustStore,
  discoveredIssues: Set<BrowserTrustIntegrityIssue>,
  keysToRemove: string[]
): boolean {
  const parsed = parseSafetyVerificationRecord(
    parseLegacyJson(storage.getItem(key))
  );
  keysToRemove.push(key);
  if (parsed && nextStore.safetyVerificationRecordsByKey[key] === undefined) {
    nextStore.safetyVerificationRecordsByKey[key] = parsed;
    return true;
  }
  if (!parsed) discoveredIssues.add("legacy_safety_verification_invalid");
  return false;
}

function migrateLegacyPeerIdentity(
  key: string,
  storage: Storage,
  nextStore: BrowserTrustStore,
  discoveredIssues: Set<BrowserTrustIntegrityIssue>,
  keysToRemove: string[],
  peerIdentityCachePrefix: string
): boolean {
  const deviceId = key.slice(peerIdentityCachePrefix.length);
  const value = storage.getItem(key);
  keysToRemove.push(key);
  if (
    deviceId &&
    value &&
    nextStore.peerIdentityCacheByDevice[deviceId] === undefined
  ) {
    nextStore.peerIdentityCacheByDevice[deviceId] = value;
    return true;
  }
  if (!value) discoveredIssues.add("legacy_peer_identity_invalid");
  return false;
}

function processLegacyKey(
  key: string,
  storage: Storage,
  nextStore: BrowserTrustStore,
  discoveredIssues: Set<BrowserTrustIntegrityIssue>,
  keysToRemove: string[],
  options: Pick<
    BrowserTrustStoreMigrationOptions,
    "deviceRegPrefix" | "safetyVerificationPrefix" | "peerIdentityCachePrefix"
  >
): boolean {
  if (key.startsWith(options.deviceRegPrefix)) {
    return migrateLegacyDeviceRegistration(
      key,
      storage,
      nextStore,
      discoveredIssues,
      keysToRemove,
      options.deviceRegPrefix
    );
  }
  if (key.startsWith(options.safetyVerificationPrefix)) {
    return migrateLegacySafetyVerification(
      key,
      storage,
      nextStore,
      discoveredIssues,
      keysToRemove
    );
  }
  if (key.startsWith(options.peerIdentityCachePrefix)) {
    return migrateLegacyPeerIdentity(
      key,
      storage,
      nextStore,
      discoveredIssues,
      keysToRemove,
      options.peerIdentityCachePrefix
    );
  }
  return false;
}

/**
 * Owns only legacy browser-storage migration into the encrypted trust-store
 * shape. It does not persist, degrade, or clean up keys by itself.
 */
export function buildMigratedTrustStore({
  baseStore,
  storage,
  registrationIdKey,
  deviceRegPrefix,
  safetyVerificationPrefix,
  peerIdentityCachePrefix,
}: BrowserTrustStoreMigrationOptions): BrowserTrustStoreMigrationResult {
  if (!storage) {
    return {
      store: baseStore,
      keysToRemove: [],
      changed: false,
      discoveredIssues: [],
    };
  }

  const nextStore = cloneTrustStore(baseStore);
  const keysToRemove: string[] = [];
  let changed = false;
  const discoveredIssues = new Set<BrowserTrustIntegrityIssue>();

  const rawRegistrationId = storage.getItem(registrationIdKey);
  if (rawRegistrationId !== null) {
    const parsedRegistrationId = Number.parseInt(rawRegistrationId, 10);
    if (
      nextStore.registrationId === undefined &&
      isValidRegistrationId(parsedRegistrationId)
    ) {
      nextStore.registrationId = parsedRegistrationId;
      changed = true;
    } else if (!isValidRegistrationId(parsedRegistrationId)) {
      discoveredIssues.add("legacy_registration_id_invalid");
    }
    keysToRemove.push(registrationIdKey);
  }

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (
      processLegacyKey(
        key,
        storage,
        nextStore,
        discoveredIssues,
        keysToRemove,
        { deviceRegPrefix, safetyVerificationPrefix, peerIdentityCachePrefix }
      )
    ) {
      changed = true;
    }
  }

  return {
    store: nextStore,
    keysToRemove,
    changed,
    discoveredIssues: Array.from(discoveredIssues),
  };
}

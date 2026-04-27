import {
  clearEncryptedByPrefix,
  loadDecrypted,
  storeEncrypted,
} from "@seclettr/crypto";
import { getOrCreateStorageKey } from "@/lib/storage-key";

const TRUST_STORE_PREFIX = "trust-store:v1";
const TRUST_STORE_KEY = `${TRUST_STORE_PREFIX}:browser`;
const REGISTRATION_ID_KEY = "seclettr.registrationId.v1";
const DEVICE_REG_PREFIX = "deviceReg:";
const SAFETY_VERIFICATION_PREFIX = "seclettr.safetyVerification.v1:";
const PEER_IDENTITY_CACHE_PREFIX = "seclettr.peerIdentity.v1:";

const BROWSER_TRUST_INTEGRITY_ISSUES = [
  "persisted_registration_id_invalid",
  "persisted_device_registration_invalid",
  "persisted_safety_verification_invalid",
  "persisted_peer_identity_invalid",
  "legacy_registration_id_invalid",
  "legacy_device_registration_invalid",
  "legacy_safety_verification_invalid",
  "legacy_peer_identity_invalid",
] as const;

export interface StoredDeviceRegistration {
  deviceId: string;
  registrationId: number;
  spkId: number;
}

export interface StoredSafetyVerificationRecord {
  safetyHash: string;
  verifiedAt: string;
}

export type BrowserTrustIntegrityIssue =
  (typeof BROWSER_TRUST_INTEGRITY_ISSUES)[number];

export interface BrowserTrustIntegrityState {
  degradedAt: string | null;
  issues: BrowserTrustIntegrityIssue[];
}

interface BrowserTrustStore {
  version: 1;
  registrationId?: number;
  deviceRegistrationsByUsername: Record<string, StoredDeviceRegistration>;
  safetyVerificationRecordsByKey: Record<string, StoredSafetyVerificationRecord>;
  peerIdentityCacheByDevice: Record<string, string>;
  integrityIssues: BrowserTrustIntegrityIssue[];
  integrityDegradedAt?: string;
}

let cachedTrustStore: BrowserTrustStore | null = null;
let cachedStorageKey: CryptoKey | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function createEmptyTrustStore(): BrowserTrustStore {
  return {
    version: 1,
    deviceRegistrationsByUsername: {},
    safetyVerificationRecordsByKey: {},
    peerIdentityCacheByDevice: {},
    integrityIssues: [],
  };
}

function cloneTrustStore(store: BrowserTrustStore): BrowserTrustStore {
  return {
    version: 1,
    registrationId: store.registrationId,
    deviceRegistrationsByUsername: { ...store.deviceRegistrationsByUsername },
    safetyVerificationRecordsByKey: { ...store.safetyVerificationRecordsByKey },
    peerIdentityCacheByDevice: { ...store.peerIdentityCacheByDevice },
    integrityIssues: [...store.integrityIssues],
    integrityDegradedAt: store.integrityDegradedAt,
  };
}

function getBrowserStorage(): Storage | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  return localStorage;
}

function isValidRegistrationId(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 16382;
}

function isBrowserTrustIntegrityIssue(
  value: unknown
): value is BrowserTrustIntegrityIssue {
  return (
    typeof value === "string" &&
    (BROWSER_TRUST_INTEGRITY_ISSUES as readonly string[]).includes(value)
  );
}

function mergeIntegrityIssues(
  ...issueGroups: Array<Iterable<BrowserTrustIntegrityIssue>>
): BrowserTrustIntegrityIssue[] {
  const issues = new Set<BrowserTrustIntegrityIssue>();
  for (const group of issueGroups) {
    for (const issue of group) {
      issues.add(issue);
    }
  }
  return Array.from(issues).sort((left, right) => left.localeCompare(right));
}

function parseStoredDeviceRegistration(
  value: unknown
): StoredDeviceRegistration | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<StoredDeviceRegistration>;
  if (
    typeof candidate.deviceId !== "string" ||
    candidate.deviceId.length === 0 ||
    !isValidRegistrationId(candidate.registrationId) ||
    !Number.isInteger(candidate.spkId)
  ) {
    return null;
  }

  return {
    deviceId: candidate.deviceId,
    registrationId: Number(candidate.registrationId),
    spkId: Number(candidate.spkId),
  };
}

function parseSafetyVerificationRecord(
  value: unknown
): StoredSafetyVerificationRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<StoredSafetyVerificationRecord>;
  if (
    typeof candidate.safetyHash !== "string" ||
    candidate.safetyHash.length === 0 ||
    typeof candidate.verifiedAt !== "string" ||
    candidate.verifiedAt.length === 0
  ) {
    return null;
  }

  return {
    safetyHash: candidate.safetyHash,
    verifiedAt: candidate.verifiedAt,
  };
}

function populateDeviceRegistrations(
  candidate: Partial<BrowserTrustStore>,
  base: BrowserTrustStore,
  discoveredIssues: Set<BrowserTrustIntegrityIssue>
): void {
  for (const [username, record] of Object.entries(
    candidate.deviceRegistrationsByUsername ?? {}
  )) {
    if (typeof username !== "string" || username.length === 0) continue;
    const parsed = parseStoredDeviceRegistration(record);
    if (parsed) {
      base.deviceRegistrationsByUsername[username] = parsed;
    } else {
      discoveredIssues.add("persisted_device_registration_invalid");
    }
  }
}

function populateSafetyVerifications(
  candidate: Partial<BrowserTrustStore>,
  base: BrowserTrustStore,
  discoveredIssues: Set<BrowserTrustIntegrityIssue>
): void {
  for (const [recordKey, record] of Object.entries(
    candidate.safetyVerificationRecordsByKey ?? {}
  )) {
    if (typeof recordKey !== "string" || recordKey.length === 0) continue;
    const parsed = parseSafetyVerificationRecord(record);
    if (parsed) {
      base.safetyVerificationRecordsByKey[recordKey] = parsed;
    } else {
      discoveredIssues.add("persisted_safety_verification_invalid");
    }
  }
}

function populatePeerIdentityCache(
  candidate: Partial<BrowserTrustStore>,
  base: BrowserTrustStore,
  discoveredIssues: Set<BrowserTrustIntegrityIssue>
): void {
  for (const [deviceId, identityKey] of Object.entries(
    candidate.peerIdentityCacheByDevice ?? {}
  )) {
    if (
      typeof deviceId === "string" &&
      deviceId.length > 0 &&
      typeof identityKey === "string" &&
      identityKey.length > 0
    ) {
      base.peerIdentityCacheByDevice[deviceId] = identityKey;
    } else {
      discoveredIssues.add("persisted_peer_identity_invalid");
    }
  }
}

function sanitizeTrustStore(value: unknown): {
  store: BrowserTrustStore;
  discoveredIssues: BrowserTrustIntegrityIssue[];
} {
  const base = createEmptyTrustStore();
  const discoveredIssues = new Set<BrowserTrustIntegrityIssue>();
  if (!value || typeof value !== "object") {
    return { store: base, discoveredIssues: [] };
  }

  const candidate = value as Partial<BrowserTrustStore>;
  if (isValidRegistrationId(candidate.registrationId)) {
    base.registrationId = candidate.registrationId;
  } else if (candidate.registrationId !== undefined) {
    discoveredIssues.add("persisted_registration_id_invalid");
  }

  base.integrityIssues = Array.isArray(candidate.integrityIssues)
    ? candidate.integrityIssues.filter(isBrowserTrustIntegrityIssue)
    : [];
  if (
    typeof candidate.integrityDegradedAt === "string" &&
    candidate.integrityDegradedAt.length > 0
  ) {
    base.integrityDegradedAt = candidate.integrityDegradedAt;
  }

  populateDeviceRegistrations(candidate, base, discoveredIssues);
  populateSafetyVerifications(candidate, base, discoveredIssues);
  populatePeerIdentityCache(candidate, base, discoveredIssues);

  return {
    store: base,
    discoveredIssues: Array.from(discoveredIssues),
  };
}

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
    await storeEncrypted(storageKey, TRUST_STORE_KEY, snapshot);
  });
  await writeQueue;
}

function removeLegacyKeys(keys: string[]): void {
  const storage = getBrowserStorage();
  if (!storage) return;
  for (const key of keys) {
    storage.removeItem(key);
  }
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
  keysToRemove: string[]
): boolean {
  const username = key.slice(DEVICE_REG_PREFIX.length);
  const parsed = parseStoredDeviceRegistration(parseLegacyJson(storage.getItem(key)));
  keysToRemove.push(key);
  if (username && parsed && nextStore.deviceRegistrationsByUsername[username] === undefined) {
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
  const parsed = parseSafetyVerificationRecord(parseLegacyJson(storage.getItem(key)));
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
  keysToRemove: string[]
): boolean {
  const deviceId = key.slice(PEER_IDENTITY_CACHE_PREFIX.length);
  const value = storage.getItem(key);
  keysToRemove.push(key);
  if (deviceId && value && nextStore.peerIdentityCacheByDevice[deviceId] === undefined) {
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
  keysToRemove: string[]
): boolean {
  if (key.startsWith(DEVICE_REG_PREFIX)) {
    return migrateLegacyDeviceRegistration(key, storage, nextStore, discoveredIssues, keysToRemove);
  }
  if (key.startsWith(SAFETY_VERIFICATION_PREFIX)) {
    return migrateLegacySafetyVerification(key, storage, nextStore, discoveredIssues, keysToRemove);
  }
  if (key.startsWith(PEER_IDENTITY_CACHE_PREFIX)) {
    return migrateLegacyPeerIdentity(key, storage, nextStore, discoveredIssues, keysToRemove);
  }
  return false;
}

function buildMigratedTrustStore(
  baseStore: BrowserTrustStore
): {
  store: BrowserTrustStore;
  keysToRemove: string[];
  changed: boolean;
  discoveredIssues: BrowserTrustIntegrityIssue[];
} {
  const storage = getBrowserStorage();
  if (!storage) {
    return { store: baseStore, keysToRemove: [], changed: false, discoveredIssues: [] };
  }

  const nextStore = cloneTrustStore(baseStore);
  const keysToRemove: string[] = [];
  let changed = false;
  const discoveredIssues = new Set<BrowserTrustIntegrityIssue>();

  const rawRegistrationId = storage.getItem(REGISTRATION_ID_KEY);
  if (rawRegistrationId !== null) {
    const parsedRegistrationId = Number.parseInt(rawRegistrationId, 10);
    if (nextStore.registrationId === undefined && isValidRegistrationId(parsedRegistrationId)) {
      nextStore.registrationId = parsedRegistrationId;
      changed = true;
    } else if (!isValidRegistrationId(parsedRegistrationId)) {
      discoveredIssues.add("legacy_registration_id_invalid");
    }
    keysToRemove.push(REGISTRATION_ID_KEY);
  }

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (processLegacyKey(key, storage, nextStore, discoveredIssues, keysToRemove)) {
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

function applyDiscoveredIntegrityIssues(
  store: BrowserTrustStore,
  discoveredIssues: BrowserTrustIntegrityIssue[]
): { store: BrowserTrustStore; changed: boolean } {
  if (discoveredIssues.length === 0) {
    return { store, changed: false };
  }

  const nextIssues = mergeIntegrityIssues(store.integrityIssues, discoveredIssues);
  const changed = (
    nextIssues.length !== store.integrityIssues.length ||
    nextIssues.some((issue, index) => issue !== store.integrityIssues[index])
  );
  if (!changed) {
    return { store, changed: false };
  }

  const shouldClearPeerIdentityCache = discoveredIssues.some((issue) =>
    issue === "persisted_peer_identity_invalid" ||
    issue === "legacy_peer_identity_invalid"
  );

  return {
    store: {
      ...store,
      peerIdentityCacheByDevice: shouldClearPeerIdentityCache
        ? {}
        : store.peerIdentityCacheByDevice,
      integrityIssues: nextIssues,
      integrityDegradedAt: new Date().toISOString(),
    },
    changed: true,
  };
}

async function loadTrustStore(
  storageKey?: CryptoKey | null
): Promise<BrowserTrustStore> {
  const resolvedStorageKey = await resolveStorageKey(storageKey);
  if (cachedTrustStore && cachedStorageKey === resolvedStorageKey) {
    return cachedTrustStore;
  }

  const restored = sanitizeTrustStore(
    await loadDecrypted<BrowserTrustStore>(resolvedStorageKey, TRUST_STORE_KEY)
  );
  const migrated = buildMigratedTrustStore(restored.store);
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
    removeLegacyKeys(migrated.keysToRemove);
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

export async function warmBrowserTrustStore(
  storageKey?: CryptoKey | null
): Promise<void> {
  await loadTrustStore(storageKey);
}

export function clearBrowserTrustStoreCache(): void {
  cachedTrustStore = null;
  cachedStorageKey = null;
}

export async function clearBrowserTrustStore(
  _storageKey?: CryptoKey | null
): Promise<void> {
  await clearEncryptedByPrefix(TRUST_STORE_PREFIX);
  clearBrowserTrustStoreCache();

  const storage = getBrowserStorage();
  if (!storage) return;
  const keysToRemove: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (
      key === REGISTRATION_ID_KEY ||
      key.startsWith(DEVICE_REG_PREFIX) ||
      key.startsWith(SAFETY_VERIFICATION_PREFIX) ||
      key.startsWith(PEER_IDENTITY_CACHE_PREFIX)
    ) {
      keysToRemove.push(key);
    }
  }
  removeLegacyKeys(keysToRemove);
}

export async function getBrowserTrustIntegrityState(
  storageKey?: CryptoKey | null
): Promise<BrowserTrustIntegrityState> {
  const store = await loadTrustStore(storageKey);
  return {
    degradedAt: store.integrityDegradedAt ?? null,
    issues: [...store.integrityIssues],
  };
}

export async function getOrCreateStoredRegistrationId(
  storageKey?: CryptoKey | null
): Promise<number> {
  const store = await loadTrustStore(storageKey);
  if (store.registrationId !== undefined) {
    return store.registrationId;
  }

  const buf = new Uint16Array(1);
  crypto.getRandomValues(buf);
  const registrationId = (buf[0]! % 16382) + 1;

  await updateTrustStore(
    (current) => ({
      ...current,
      registrationId,
    }),
    storageKey
  );

  return registrationId;
}

export async function getStoredDeviceRegistration(
  username: string,
  storageKey?: CryptoKey | null
): Promise<StoredDeviceRegistration | null> {
  const store = await loadTrustStore(storageKey);
  return store.deviceRegistrationsByUsername[username] ?? null;
}

export async function setStoredDeviceRegistration(
  username: string,
  registration: StoredDeviceRegistration,
  storageKey?: CryptoKey | null
): Promise<void> {
  await updateTrustStore(
    (current) => ({
      ...current,
      deviceRegistrationsByUsername: {
        ...current.deviceRegistrationsByUsername,
        [username]: registration,
      },
    }),
    storageKey
  );
}

export function getLegacyVerificationStorageKey(
  myUserId: string,
  recipientUserId: string,
  peerDeviceId = "unknown-device"
): string {
  return `${SAFETY_VERIFICATION_PREFIX}${myUserId}:${recipientUserId}:${peerDeviceId}`;
}

export function getVerificationStorageKey(
  myUserId: string,
  myDeviceId: string,
  recipientUserId: string,
  peerDeviceId = "unknown-device"
): string {
  return `${SAFETY_VERIFICATION_PREFIX}${myUserId}:${myDeviceId}:${recipientUserId}:${peerDeviceId}`;
}

export async function getStoredSafetyVerificationRecord(
  myUserId: string,
  myDeviceId: string,
  recipientUserId: string,
  peerDeviceId?: string,
  storageKey?: CryptoKey | null
): Promise<StoredSafetyVerificationRecord | null> {
  const scopedKey = getVerificationStorageKey(
    myUserId,
    myDeviceId,
    recipientUserId,
    peerDeviceId
  );
  const legacyKey = getLegacyVerificationStorageKey(
    myUserId,
    recipientUserId,
    peerDeviceId
  );
  const store = await loadTrustStore(storageKey);
  const scopedRecord = store.safetyVerificationRecordsByKey[scopedKey];
  if (scopedRecord) {
    const degradedAtMs = Date.parse(store.integrityDegradedAt ?? "");
    const verifiedAtMs = Date.parse(scopedRecord.verifiedAt);
    if (
      Number.isFinite(degradedAtMs) &&
      (!Number.isFinite(verifiedAtMs) || verifiedAtMs < degradedAtMs)
    ) {
      return null;
    }
    return scopedRecord;
  }

  const legacyRecord = store.safetyVerificationRecordsByKey[legacyKey];
  if (!legacyRecord) {
    return null;
  }

  await updateTrustStore(
    (current) => {
      const nextRecords = { ...current.safetyVerificationRecordsByKey };
      nextRecords[scopedKey] = legacyRecord;
      delete nextRecords[legacyKey];
      return {
        ...current,
        safetyVerificationRecordsByKey: nextRecords,
      };
    },
    storageKey
  );

  const degradedAtMs = Date.parse(store.integrityDegradedAt ?? "");
  const verifiedAtMs = Date.parse(legacyRecord.verifiedAt);
  if (
    Number.isFinite(degradedAtMs) &&
    (!Number.isFinite(verifiedAtMs) || verifiedAtMs < degradedAtMs)
  ) {
    return null;
  }

  return legacyRecord;
}

export async function setStoredSafetyVerificationRecord(
  myUserId: string,
  myDeviceId: string,
  recipientUserId: string,
  safetyHash: string,
  peerDeviceId?: string,
  storageKey?: CryptoKey | null
): Promise<StoredSafetyVerificationRecord> {
  const record: StoredSafetyVerificationRecord = {
    safetyHash,
    verifiedAt: new Date().toISOString(),
  };
  const scopedKey = getVerificationStorageKey(
    myUserId,
    myDeviceId,
    recipientUserId,
    peerDeviceId
  );
  const legacyKey = getLegacyVerificationStorageKey(
    myUserId,
    recipientUserId,
    peerDeviceId
  );

  await updateTrustStore(
    (current) => {
      const nextRecords = {
        ...current.safetyVerificationRecordsByKey,
        [scopedKey]: record,
      };
      delete nextRecords[legacyKey];
      return {
        ...current,
        safetyVerificationRecordsByKey: nextRecords,
      };
    },
    storageKey
  );

  return record;
}

export async function clearStoredSafetyVerificationRecord(
  myUserId: string,
  myDeviceId: string,
  recipientUserId: string,
  peerDeviceId?: string,
  storageKey?: CryptoKey | null
): Promise<void> {
  const scopedKey = getVerificationStorageKey(
    myUserId,
    myDeviceId,
    recipientUserId,
    peerDeviceId
  );
  const legacyKey = getLegacyVerificationStorageKey(
    myUserId,
    recipientUserId,
    peerDeviceId
  );

  await updateTrustStore(
    (current) => {
      const nextRecords = { ...current.safetyVerificationRecordsByKey };
      delete nextRecords[scopedKey];
      delete nextRecords[legacyKey];
      return {
        ...current,
        safetyVerificationRecordsByKey: nextRecords,
      };
    },
    storageKey
  );
}

function ensureCachedTrustStore(): BrowserTrustStore {
  cachedTrustStore ??= createEmptyTrustStore();
  return cachedTrustStore;
}

export function readCachedPeerIdentityKey(
  deviceId: string
): string | null {
  return cachedTrustStore?.peerIdentityCacheByDevice[deviceId] ?? null;
}

export function primeCachedPeerIdentityKey(
  deviceId: string,
  identityKey: string
): void {
  const store = ensureCachedTrustStore();
  store.peerIdentityCacheByDevice[deviceId] = identityKey;
}

export async function persistCachedPeerIdentityKey(
  deviceId: string,
  identityKey: string,
  storageKey?: CryptoKey | null
): Promise<void> {
  await updateTrustStore(
    (current) => ({
      ...current,
      peerIdentityCacheByDevice: {
        ...current.peerIdentityCacheByDevice,
        [deviceId]: identityKey,
      },
    }),
    storageKey
  );
}

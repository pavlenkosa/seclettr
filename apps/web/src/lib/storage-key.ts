import { generateStorageKey, rewrapEncryptedStorage } from "@seclettr/crypto";

export const STORAGE_KEY_RAW_ITEM = "seclettr.storageKey.v1";
export const STORAGE_KEY_RAW_LEGACY_ITEM = "storageKey";

const STORAGE_KEY_META_DB = "seclettr-auth-meta";
const STORAGE_KEY_META_STORE = "secrets";
const STORAGE_KEY_META_ITEM = "storage-key-v2";
const PIN_WRAP_ITERATIONS = 600_000;
const PIN_WRAP_SALT_BYTES = 16;
const PIN_WRAP_IV_BYTES = 12;

interface PinWrappedStorageKeyRecord {
  version: 3;
  protection: "pin";
  salt: number[];
  payload: number[];
}

interface PinReadyStorageKeyRecord {
  version: 3;
  protection: "pin-ready";
  unlockedKey: CryptoKey;
  lockedKey: PinWrappedStorageKeyRecord;
}

let volatileStorageKey: CryptoKey | null = null;

function openStorageKeyMetaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(STORAGE_KEY_META_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORAGE_KEY_META_STORE)) {
        db.createObjectStore(STORAGE_KEY_META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB operation failed"));
  });
}

async function loadPersistedStorageKeyRecord(): Promise<unknown> {
  try {
    const db = await openStorageKeyMetaDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORAGE_KEY_META_STORE, "readonly");
      const req = tx.objectStore(STORAGE_KEY_META_STORE).get(STORAGE_KEY_META_ITEM);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error ?? new Error("IndexedDB operation failed"));
    });
  } catch {
    return null;
  }
}

async function persistStorageKeyRecord(
  value: CryptoKey | PinWrappedStorageKeyRecord | PinReadyStorageKeyRecord
): Promise<boolean> {
  try {
    const db = await openStorageKeyMetaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORAGE_KEY_META_STORE, "readwrite");
      const req = tx.objectStore(STORAGE_KEY_META_STORE).put(value, STORAGE_KEY_META_ITEM);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error("IndexedDB operation failed"));
    });
    return true;
  } catch {
    return false;
  }
}

export async function clearPersistedStorageKey(): Promise<void> {
  volatileStorageKey = null;
  try {
    const db = await openStorageKeyMetaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORAGE_KEY_META_STORE, "readwrite");
      const req = tx.objectStore(STORAGE_KEY_META_STORE).delete(STORAGE_KEY_META_ITEM);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error("IndexedDB operation failed"));
    });
  } catch {
    // No-op: logout should not fail if browser storage is unavailable.
  }
}

function getBrowserStorage(slot: "localStorage" | "sessionStorage"): Storage | null {
  const value = globalThis[slot];
  if (!value) {
    return null;
  }
  return value;
}

function getLegacyStorageKeyRawB64(): string | null {
  const local = getBrowserStorage("localStorage");
  const session = getBrowserStorage("sessionStorage");
  return (
    local?.getItem(STORAGE_KEY_RAW_ITEM) ??
    local?.getItem(STORAGE_KEY_RAW_LEGACY_ITEM) ??
    session?.getItem(STORAGE_KEY_RAW_ITEM) ??
    session?.getItem(STORAGE_KEY_RAW_LEGACY_ITEM) ??
    null
  );
}

export function clearLegacyStorageKeyStorage(): void {
  const storages = [
    getBrowserStorage("localStorage"),
    getBrowserStorage("sessionStorage"),
  ];
  for (const storage of storages) {
    storage?.removeItem(STORAGE_KEY_RAW_ITEM);
    storage?.removeItem(STORAGE_KEY_RAW_LEGACY_ITEM);
  }
}

async function importStorageKeyFromRaw(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    toExactArrayBuffer(raw),
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
}

async function exportStorageKeyRaw(storageKey: CryptoKey): Promise<Uint8Array> {
  const raw = await crypto.subtle.exportKey("raw", storageKey);
  return new Uint8Array(raw);
}

async function derivePinWrapKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const pinBytes = new TextEncoder().encode(pin);
  const baseKey = await crypto.subtle.importKey(
    "raw",
    toExactArrayBuffer(pinBytes),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: toExactArrayBuffer(salt),
      iterations: PIN_WRAP_ITERATIONS,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function toExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

async function createPinWrappedStorageKeyRecord(
  storageKey: CryptoKey,
  pin: string
): Promise<PinWrappedStorageKeyRecord> {
  const raw = await exportStorageKeyRaw(storageKey);
  const salt = crypto.getRandomValues(new Uint8Array(PIN_WRAP_SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(PIN_WRAP_IV_BYTES));

  try {
    const wrapKey = await derivePinWrapKey(pin, salt);
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      wrapKey,
      toExactArrayBuffer(raw)
    ));
    const payload = new Uint8Array(iv.length + ciphertext.length);
    payload.set(iv, 0);
    payload.set(ciphertext, iv.length);

    return {
      version: 3,
      protection: "pin",
      salt: Array.from(salt),
      payload: Array.from(payload),
    };
  } finally {
    raw.fill(0);
  }
}

async function unwrapPinProtectedStorageKey(
  record: PinWrappedStorageKeyRecord,
  pin: string
): Promise<CryptoKey> {
  const salt = new Uint8Array(record.salt);
  const payload = new Uint8Array(record.payload);
  const iv = payload.slice(0, PIN_WRAP_IV_BYTES);
  const ciphertext = payload.slice(PIN_WRAP_IV_BYTES);

  try {
    const wrapKey = await derivePinWrapKey(pin, salt);
    const raw = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toExactArrayBuffer(iv) },
      wrapKey,
      toExactArrayBuffer(ciphertext)
    ));
    try {
      return await importStorageKeyFromRaw(raw);
    } finally {
      raw.fill(0);
    }
  } finally {
    salt.fill(0);
    payload.fill(0);
    iv.fill(0);
    ciphertext.fill(0);
  }
}

function isPinWrappedStorageKeyRecord(value: unknown): value is PinWrappedStorageKeyRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PinWrappedStorageKeyRecord>;
  return (
    candidate.version === 3 &&
    candidate.protection === "pin" &&
    Array.isArray(candidate.salt) &&
    Array.isArray(candidate.payload)
  );
}

function isPinReadyStorageKeyRecord(value: unknown): value is PinReadyStorageKeyRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PinReadyStorageKeyRecord>;
  return (
    candidate.version === 3 &&
    candidate.protection === "pin-ready" &&
    isStoredCryptoKey(candidate.unlockedKey) &&
    isPinWrappedStorageKeyRecord(candidate.lockedKey)
  );
}

function isStoredCryptoKey(value: unknown): value is CryptoKey {
  if (typeof CryptoKey !== "undefined" && value instanceof CryptoKey) {
    return true;
  }
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as {
    algorithm?: { name?: unknown };
    extractable?: unknown;
    type?: unknown;
    usages?: unknown;
  };

  return (
    candidate.algorithm !== null &&
    typeof candidate.algorithm === "object" &&
    typeof candidate.algorithm?.name === "string" &&
    typeof candidate.extractable === "boolean" &&
    typeof candidate.type === "string" &&
    Array.isArray(candidate.usages)
  );
}

async function createAndPersistStorageKey(): Promise<{ key: CryptoKey; volatile: boolean }> {
  const { raw } = await generateStorageKey();
  try {
    const key = await importStorageKeyFromRaw(raw);
    const persistedOk = await persistStorageKeyRecord(key);
    if (!persistedOk) {
      volatileStorageKey = key;
    }
    return { key, volatile: !persistedOk };
  } finally {
    raw.fill(0);
  }
}

export async function getOrCreateStorageKey(): Promise<{
  key: CryptoKey;
  volatile: boolean;
}> {
  const persisted = await loadPersistedStorageKeyRecord();
  if (isStoredCryptoKey(persisted)) {
    volatileStorageKey = null;
    clearLegacyStorageKeyStorage();
    return { key: persisted, volatile: false };
  }

  if (isPinReadyStorageKeyRecord(persisted)) {
    const persistedOk = await persistStorageKeyRecord(persisted.lockedKey);
    if (!persistedOk) {
      throw new Error("storage_key_lock_persist_failed");
    }
    volatileStorageKey = null;
    clearLegacyStorageKeyStorage();
    throw new Error("storage_key_locked");
  }

  if (isPinWrappedStorageKeyRecord(persisted)) {
    if (volatileStorageKey) {
      clearLegacyStorageKeyStorage();
      return { key: volatileStorageKey, volatile: false };
    }
    throw new Error("storage_key_locked");
  }

  if (volatileStorageKey) {
    clearLegacyStorageKeyStorage();
    return { key: volatileStorageKey, volatile: true };
  }

  const rawB64 = getLegacyStorageKeyRawB64();
  if (rawB64) {
    const raw = Uint8Array.from(atob(rawB64), c => c.codePointAt(0)!);
    try {
      const key = await importStorageKeyFromRaw(raw);
      const persistedOk = await persistStorageKeyRecord(key);
      clearLegacyStorageKeyStorage();
      if (!persistedOk) {
        volatileStorageKey = key;
      }
      return { key, volatile: !persistedOk };
    } finally {
      raw.fill(0);
    }
  }

  return createAndPersistStorageKey();
}

export async function unlockPersistedStorageKey(pin: string): Promise<{
  key: CryptoKey;
  volatile: boolean;
}> {
  const persisted = await loadPersistedStorageKeyRecord();
  const lockedRecordFromReady = isPinReadyStorageKeyRecord(persisted) ? persisted.lockedKey : null;
  const lockedRecord = isPinWrappedStorageKeyRecord(persisted) ? persisted : lockedRecordFromReady;
  if (lockedRecord) {
    const key = await unwrapPinProtectedStorageKey(lockedRecord, pin);
    if (isPinReadyStorageKeyRecord(persisted)) {
      const persistedOk = await persistStorageKeyRecord(lockedRecord);
      if (!persistedOk) {
        throw new Error("storage_key_lock_persist_failed");
      }
    }
    volatileStorageKey = key;
    clearLegacyStorageKeyStorage();
    return { key, volatile: false };
  }

  return getOrCreateStorageKey();
}

export async function protectPersistedStorageKeyWithPin(
  storageKey: CryptoKey,
  pin: string
): Promise<void> {
  const record = await createPinWrappedStorageKeyRecord(storageKey, pin);
  const persistedOk = await persistStorageKeyRecord(record);
  if (!persistedOk) {
    throw new Error("storage_key_lock_persist_failed");
  }
  volatileStorageKey = storageKey;
}

export async function lockPersistedStorageKey(): Promise<void> {
  const persisted = await loadPersistedStorageKeyRecord();
  if (isPinReadyStorageKeyRecord(persisted)) {
    const persistedOk = await persistStorageKeyRecord(persisted.lockedKey);
    if (!persistedOk) {
      throw new Error("storage_key_lock_persist_failed");
    }
    volatileStorageKey = null;
    return;
  }
  if (isPinWrappedStorageKeyRecord(persisted)) {
    volatileStorageKey = null;
  }
}

export async function removeStorageKeyPinProtection(
  storageKey: CryptoKey
): Promise<void> {
  const persistedOk = await persistStorageKeyRecord(storageKey);
  if (persistedOk) {
    volatileStorageKey = null;
  } else {
    volatileStorageKey = storageKey;
  }
}

export async function ensureExportableStorageKey(
  storageKey: CryptoKey
): Promise<{
  key: CryptoKey;
  volatile: boolean;
}> {
  try {
    const raw = await exportStorageKeyRaw(storageKey);
    raw.fill(0);
    return { key: storageKey, volatile: false };
  } catch {
    const { raw } = await generateStorageKey();
    try {
      const nextKey = await importStorageKeyFromRaw(raw);
      await rewrapEncryptedStorage(storageKey, nextKey);
      const persistedOk = await persistStorageKeyRecord(nextKey);
      if (persistedOk) {
        volatileStorageKey = null;
      } else {
        volatileStorageKey = nextKey;
      }
      return {
        key: nextKey,
        volatile: !persistedOk,
      };
    } finally {
      raw.fill(0);
    }
  }
}

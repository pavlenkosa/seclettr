import { buf } from "./buf.js";

export interface StorageKey {
  key: CryptoKey;
}

export type StorageLoadErrorCode =
  | "decrypt_failed"
  | "invalid_json"
  | "unexpected_error";

export interface StorageLoadError {
  code: StorageLoadErrorCode;
  itemKey: string;
  cause: unknown;
}

export interface LoadDecryptedOptions {
  onError?: (error: StorageLoadError) => void;
}

const DB_NAME = "seclettr-crypto";
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

async function openDb(): Promise<IDBDatabase> {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("keystore")) {
        db.createObjectStore("keystore");
      }
    };
    req.onsuccess = (ev) => {
      _db = (ev.target as IDBOpenDBRequest).result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

async function idbGet(key: string): Promise<Uint8Array | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keystore", "readonly");
    const req = tx.objectStore("keystore").get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error ?? new Error("Failed to read from IndexedDB"));
  });
}

async function idbPut(key: string, value: Uint8Array): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keystore", "readwrite");
    const req = tx.objectStore("keystore").put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Failed to write to IndexedDB"));
  });
}

async function idbListEntries(prefix?: string): Promise<Array<{ key: string; value: Uint8Array }>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keystore", "readonly");
    const store = tx.objectStore("keystore");
    const entries: Array<{ key: string; value: Uint8Array }> = [];

    tx.oncomplete = () => resolve(entries);
    tx.onerror = () =>
      reject(tx.error ?? new Error("Failed to list encrypted storage entries"));
    tx.onabort = () =>
      reject(tx.error ?? new Error("IndexedDB transaction aborted"));

    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      if (
        typeof cursor.key === "string" &&
        cursor.value instanceof Uint8Array &&
        (!prefix || cursor.key.startsWith(prefix))
      ) {
        entries.push({
          key: cursor.key,
          value: cursor.value,
        });
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error ?? new Error("IndexedDB operation failed"));
  });
}

async function idbPutMany(entries: Array<{ key: string; value: Uint8Array }>): Promise<void> {
  if (entries.length === 0) {
    return;
  }

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("keystore", "readwrite");
    const store = tx.objectStore("keystore");
    for (const entry of entries) {
      store.put(entry.value, entry.key);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error("Failed to rewrite encrypted storage entries"));
    tx.onabort = () =>
      reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

async function idbDeleteByPrefix(prefix: string): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("keystore", "readwrite");
    const store = tx.objectStore("keystore");
    let deleted = 0;

    tx.oncomplete = () => resolve(deleted);
    tx.onerror = () =>
      reject(tx.error ?? new Error("Failed to delete keys by prefix"));
    tx.onabort = () =>
      reject(tx.error ?? new Error("IndexedDB transaction aborted"));

    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) {
        cursor.delete();
        deleted += 1;
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error ?? new Error("IndexedDB operation failed"));
  });
}

export async function deriveStorageKey(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: buf(salt), iterations: 210_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function generateStorageKey(): Promise<{ key: CryptoKey; raw: Uint8Array }> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey(
    "raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]
  );
  return { key, raw };
}

async function encrypt(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, buf(data));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), 12);
  return out;
}

async function decrypt(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = data.slice(0, 12);
  const ct = data.slice(12);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new Uint8Array(plain);
}

export async function storeEncrypted(
  storageKey: CryptoKey,
  itemKey: string,
  value: unknown
): Promise<void> {
  const enc = new TextEncoder();
  const json = enc.encode(JSON.stringify(value));
  const encrypted = await encrypt(storageKey, json);
  await idbPut(itemKey, encrypted);
}

export async function loadDecrypted<T>(
  storageKey: CryptoKey,
  itemKey: string,
  options?: LoadDecryptedOptions
): Promise<T | null> {
  const encrypted = await idbGet(itemKey);
  if (!encrypted) return null;
  try {
    const dec = new TextDecoder();
    const json = dec.decode(await decrypt(storageKey, encrypted));
    return JSON.parse(json) as T;
  } catch (error) {
    emitLoadError(itemKey, error, options);
    return null;
  }
}

export async function storeBytes(
  storageKey: CryptoKey,
  itemKey: string,
  bytes: Uint8Array
): Promise<void> {
  const encrypted = await encrypt(storageKey, bytes);
  await idbPut(itemKey, encrypted);
}

export async function loadBytes(
  storageKey: CryptoKey,
  itemKey: string
): Promise<Uint8Array | null> {
  const encrypted = await idbGet(itemKey);
  if (!encrypted) return null;
  try {
    return await decrypt(storageKey, encrypted);
  } catch {
    return null;
  }
}

export async function clearEncryptedByPrefix(prefix: string): Promise<number> {
  return idbDeleteByPrefix(prefix);
}

export async function rewrapEncryptedStorage(
  currentKey: CryptoKey,
  nextKey: CryptoKey,
  options?: { prefix?: string }
): Promise<number> {
  const entries = await idbListEntries(options?.prefix);
  if (entries.length === 0) {
    return 0;
  }

  const rewrittenEntries: Array<{ key: string; value: Uint8Array }> = [];
  try {
    for (const entry of entries) {
      const plaintext = await decrypt(currentKey, entry.value);
      try {
        rewrittenEntries.push({
          key: entry.key,
          value: await encrypt(nextKey, plaintext),
        });
      } finally {
        plaintext.fill(0);
      }
    }

    await idbPutMany(rewrittenEntries);
    return rewrittenEntries.length;
  } finally {
    for (const entry of rewrittenEntries) {
      entry.value.fill(0);
    }
  }
}

function emitLoadError(
  itemKey: string,
  cause: unknown,
  options?: LoadDecryptedOptions
): void {
  if (!options?.onError) return;
  try {
    options.onError({
      code: classifyLoadError(cause),
      itemKey,
      cause,
    });
  } catch {
    return;
  }
}

function classifyLoadError(error: unknown): StorageLoadErrorCode {
  if (error instanceof SyntaxError) {
    return "invalid_json";
  }

  const errorName =
    error && typeof error === "object" && "name" in error
      ? (error as { name?: unknown }).name
      : null;
  if (errorName === "OperationError" || errorName === "InvalidAccessError") {
    return "decrypt_failed";
  }

  return "unexpected_error";
}

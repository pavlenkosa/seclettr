/**
 * App-lock PIN — PBKDF2-SHA-256 verifier stored in IndexedDB.
 *
 * The PIN is never stored in plaintext.  A 16-byte random salt is generated
 * at set-time; the verifier is 256 bits derived via 300 000 PBKDF2 iterations.
 * Verification performs a constant-time byte comparison to prevent timing leaks.
 */

const DB_NAME = "seclettr-lock-pin";
const STORE_NAME = "pin";
const RECORD_KEY = "v1";
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const LEGACY_LOCK_SNAPSHOT_STORAGE_KEY = "seclettr.appLock.snapshot.v1";

interface PinRecord {
  salt: number[];
  verifier: number[];
}


function toStandaloneArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB operation failed"));
  });
}

async function deriveVerifier(pin: string, salt: Uint8Array): Promise<Uint8Array> {
  const pinBytes = new TextEncoder().encode(pin);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    toStandaloneArrayBuffer(pinBytes),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: toStandaloneArrayBuffer(salt), iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

async function loadPinRecord(): Promise<PinRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as PinRecord | undefined) ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error ?? new Error("IndexedDB operation failed"));
    };
  });
}

export async function hasPinSet(): Promise<boolean> {
  const record = await loadPinRecord();
  return record !== null;
}

export async function setPinHash(pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const verifier = await deriveVerifier(pin, salt);
  const record: PinRecord = {
    salt: Array.from(salt),
    verifier: Array.from(verifier),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record, RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
  db.close();
}

export async function verifyPin(pin: string): Promise<boolean> {
  const record = await loadPinRecord();
  if (!record) return false;
  const salt = new Uint8Array(record.salt);
  const expected = new Uint8Array(record.verifier);
  const actual = await deriveVerifier(pin, salt);
  if (actual.length !== expected.length) return false;
  // Constant-time comparison
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= (actual[i] ?? 0) ^ (expected[i] ?? 0);
  }
  return diff === 0;
}

export async function clearPin(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(RECORD_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
  db.close();
}

export function clearLegacyLockSnapshotStorage(): void {
  try {
    localStorage.removeItem(LEGACY_LOCK_SNAPSHOT_STORAGE_KEY);
  } catch {
    // No-op.
  }
}

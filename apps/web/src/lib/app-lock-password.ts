/**
 * App-lock passcode — Argon2id verifier stored in IndexedDB.
 *
 * The passcode is never stored. A 16-byte random salt is generated at set-time;
 * the verifier is 32 bytes derived via Argon2id (libsodium defaults:
 * OPSLIMIT_INTERACTIVE / MEMLIMIT_INTERACTIVE). Verification is constant-time.
 *
 * Accepts any UTF-8 string (not limited to digits).
 */

import { ensureSodium } from "@seclettr/crypto";

const DB_NAME = "seclettr-lock-pin";
const STORE_NAME = "pin";
const RECORD_KEY = "v1";
const LEGACY_LOCK_SNAPSHOT_STORAGE_KEY = "seclettr.appLock.snapshot.v1";
const HASH_BYTES = 32;
const SALT_BYTES = 16;

interface PasscodeRecord {
  algo: "argon2id-v1";
  salt: number[];
  verifier: number[];
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

async function deriveVerifier(passcode: string, salt: Uint8Array): Promise<Uint8Array> {
  const sodium = await ensureSodium();
  const passcodeBytes = new TextEncoder().encode(passcode);
  return sodium.crypto_pwhash(
    HASH_BYTES,
    passcodeBytes,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );
}

async function loadRecord(): Promise<unknown> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
    req.onsuccess = () => {
      db.close();
      resolve(req.result ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error ?? new Error("IndexedDB operation failed"));
    };
  });
}

function isPasscodeRecord(value: unknown): value is PasscodeRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Partial<PasscodeRecord>;
  return r.algo === "argon2id-v1" && Array.isArray(r.salt) && Array.isArray(r.verifier);
}

export async function hasPinSet(): Promise<boolean> {
  const record = await loadRecord();
  return isPasscodeRecord(record);
}

export async function setPinHash(passcode: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const verifier = await deriveVerifier(passcode, salt);
  const record: PasscodeRecord = {
    algo: "argon2id-v1",
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

export async function verifyPin(passcode: string): Promise<boolean> {
  const raw = await loadRecord();
  if (!isPasscodeRecord(raw)) return false;
  const salt = new Uint8Array(raw.salt);
  const expected = new Uint8Array(raw.verifier);
  const actual = await deriveVerifier(passcode, salt);
  if (actual.length !== expected.length) return false;
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

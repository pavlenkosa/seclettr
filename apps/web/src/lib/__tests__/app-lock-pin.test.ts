import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLegacyLockSnapshotStorage,
  clearPin,
  hasPinSet,
  setPinHash,
  verifyPin,
} from "../app-lock-pin";


function bufferSourceToUint8Array(source: BufferSource): Uint8Array {
  if (source instanceof ArrayBuffer) {
    return new Uint8Array(source);
  }
  return new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
}

// ------------------------------------------------------------------
// Fast PBKDF2 stub.
// Real PBKDF2 keys cannot be exported, so we intercept at importKey:
// store the raw password bytes on a WeakMap, then deriveBits uses
// SHA-256(password || salt) — deterministic and fast.
// ------------------------------------------------------------------
function installFastCrypto() {
  const keyBytes = new WeakMap<CryptoKey, Uint8Array>();
  const realSubtle = webcrypto.subtle;

  const stubbedSubtle: SubtleCrypto = {
    ...realSubtle,
    importKey: async (
      format: KeyFormat,
      keyData: BufferSource | JsonWebKey,
      algorithm: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams | HmacImportParams | AesKeyAlgorithm,
      extractable: boolean,
      keyUsages: KeyUsage[]
    ) => {
      const algName = typeof algorithm === "string" ? algorithm : (algorithm as Algorithm).name;
      if (algName === "PBKDF2" && format === "raw") {
        const key = await realSubtle.importKey(
          "raw",
          keyData as BufferSource,
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"]
        );
        keyBytes.set(key, bufferSourceToUint8Array(keyData as BufferSource));
        return key;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (realSubtle.importKey as (...args: any[]) => Promise<CryptoKey>)(format, keyData, algorithm, extractable, keyUsages);
    },
    deriveBits: async (
      algorithm: AlgorithmIdentifier | EcdhKeyDeriveParams | HkdfParams | Pbkdf2Params,
      baseKey: CryptoKey,
      length: number
    ) => {
      const pw = keyBytes.get(baseKey);
      const params = algorithm as Pbkdf2Params;
      const salt = bufferSourceToUint8Array(params.salt);
      const combined = new Uint8Array((pw?.length ?? 0) + salt.length);
      if (pw) combined.set(pw, 0);
      combined.set(salt, pw?.length ?? 0);
      const digest = await realSubtle.digest("SHA-256", combined);
      return digest.slice(0, length / 8);
    },
  } as SubtleCrypto;

  vi.stubGlobal("crypto", {
    ...webcrypto,
    getRandomValues: (arr: Uint8Array) => webcrypto.getRandomValues(arr),
    subtle: stubbedSubtle,
  });
}

// ------------------------------------------------------------------
// Fake IndexedDB — supports the "pin" store used by app-lock-pin.
// ------------------------------------------------------------------
function installFakeIndexedDb(): Map<string, unknown> {
  const store = new Map<string, unknown>();

  function asyncRequest<T>(run: () => T) {
    const req = {
      result: undefined as T | undefined,
      error: null as unknown,
      onsuccess: null as ((e: unknown) => void) | null,
      onerror: null as ((e: unknown) => void) | null,
    };
    queueMicrotask(() => {
      try {
        req.result = run();
        req.onsuccess?.({ target: req });
      } catch (err) {
        req.error = err;
        req.onerror?.({ target: req });
      }
    });
    return req;
  }

  function makePinStore() {
    return {
      get: (key: string) => asyncRequest(() => store.get(key)),
      put: (value: unknown, key: string) => asyncRequest(() => { store.set(key, value); return key; }),
      delete: (key: string) => asyncRequest(() => { store.delete(key); return undefined; }),
    };
  }

  const fakeDb = {
    close: vi.fn(),
    createObjectStore: vi.fn(),
    objectStoreNames: { contains: vi.fn(() => false) },
    transaction: (_storeName: string, _mode: string) => {
      const tx = {
        objectStore: () => makePinStore(),
        oncomplete: null as (() => void) | null,
        onerror: null as (() => void) | null,
        error: null as unknown,
      };
      // Fire oncomplete after all pending microtasks settle.
      queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.()));
      return tx;
    },
  };

  vi.stubGlobal("indexedDB", {
    open: (_name: string, _version: number) => {
      const req = {
        result: undefined as unknown,
        error: null as unknown,
        onsuccess: null as ((e: unknown) => void) | null,
        onerror: null as ((e: unknown) => void) | null,
        onupgradeneeded: null as ((e: unknown) => void) | null,
      };
      queueMicrotask(() => {
        req.result = fakeDb;
        try {
          req.onupgradeneeded?.({ target: req });
        } catch { /* ignore */ }
        req.onsuccess?.({ target: req });
      });
      return req;
    },
  });

  return store;
}

describe("app-lock-pin", () => {
  beforeEach(() => {
    installFakeIndexedDb();
    installFastCrypto();
    const localStorageData = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => localStorageData.get(k) ?? null,
      setItem: (k: string, v: string) => { localStorageData.set(k, v); },
      removeItem: (k: string) => { localStorageData.delete(k); },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("hasPinSet", () => {
    it("returns false when no PIN has been set", async () => {
      expect(await hasPinSet()).toBe(false);
    });

    it("returns true after a PIN is set", async () => {
      await setPinHash("1234");
      expect(await hasPinSet()).toBe(true);
    });

    it("returns false after PIN is cleared", async () => {
      await setPinHash("1234");
      await clearPin();
      expect(await hasPinSet()).toBe(false);
    });
  });

  describe("verifyPin", () => {
    it("returns false when no PIN is stored", async () => {
      expect(await verifyPin("1234")).toBe(false);
    });

    it("returns true for the correct PIN", async () => {
      await setPinHash("5678");
      expect(await verifyPin("5678")).toBe(true);
    });

    it("returns false for an incorrect PIN", async () => {
      await setPinHash("5678");
      expect(await verifyPin("0000")).toBe(false);
    });

    it("is case-sensitive", async () => {
      await setPinHash("ABCD");
      expect(await verifyPin("abcd")).toBe(false);
      expect(await verifyPin("ABCD")).toBe(true);
    });

    it("differentiates PINs of different lengths", async () => {
      await setPinHash("1234");
      expect(await verifyPin("12345")).toBe(false);
      expect(await verifyPin("123")).toBe(false);
    });
  });

  describe("clearPin", () => {
    it("does not throw when no PIN is stored", async () => {
      await expect(clearPin()).resolves.toBeUndefined();
    });

    it("removes a stored PIN", async () => {
      await setPinHash("9999");
      await clearPin();
      expect(await hasPinSet()).toBe(false);
    });

    it("makes verifyPin return false after clear", async () => {
      await setPinHash("1234");
      await clearPin();
      expect(await verifyPin("1234")).toBe(false);
    });
  });

  describe("clearLegacyLockSnapshotStorage", () => {
    it("removes the legacy key from localStorage", () => {
      localStorage.setItem("seclettr.appLock.snapshot.v1", "snapshot-data");
      clearLegacyLockSnapshotStorage();
      expect(localStorage.getItem("seclettr.appLock.snapshot.v1")).toBeNull();
    });

    it("does not throw when the key is absent", () => {
      expect(() => clearLegacyLockSnapshotStorage()).not.toThrow();
    });
  });
});

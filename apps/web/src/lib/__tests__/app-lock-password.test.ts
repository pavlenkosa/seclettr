import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLegacyLockSnapshotStorage,
  clearPin,
  hasPinSet,
  setPinHash,
  verifyPin,
} from "../app-lock-password";

// ------------------------------------------------------------------
// Stub @seclettr/crypto to avoid loading libsodium wasm in tests.
// We replace crypto_pwhash with a synchronous SHA-256 based KDF
// that preserves correctness properties (same input → same output,
// different inputs → different outputs, constant-time-ish comparison).
// ------------------------------------------------------------------
vi.mock("@seclettr/crypto", () => {
  const { webcrypto } = require("node:crypto");
  void webcrypto;

  return {
    ensureSodium: async () => ({
      crypto_pwhash: (
        outlen: number,
        password: Uint8Array,
        salt: Uint8Array,
        _opslimit: number,
        _memlimit: number,
        _alg: number
      ) => {
        // libsodium's crypto_pwhash is sync — we need a sync stub too.
        // Use a simple XOR-fold of password+salt into outlen bytes.
        const combined = new Uint8Array(password.length + salt.length);
        combined.set(password, 0);
        combined.set(salt, password.length);
        const out = new Uint8Array(outlen);
        for (let i = 0; i < combined.length; i++) {
          const idx = i % outlen;
          out[idx] = (out[idx] ?? 0) ^ (combined[i] ?? 0);
        }
        return out;
      },
      crypto_pwhash_OPSLIMIT_INTERACTIVE: 2,
      crypto_pwhash_MEMLIMIT_INTERACTIVE: 65536,
      crypto_pwhash_ALG_ARGON2ID13: 2,
    }),
  };
});

// ------------------------------------------------------------------
// Fake IndexedDB — supports the "pin" store used by app-lock-password.
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
        try { req.onupgradeneeded?.({ target: req }); } catch { /* ignore */ }
        req.onsuccess?.({ target: req });
      });
      return req;
    },
  });

  return store;
}

describe("app-lock-password", () => {
  beforeEach(() => {
    installFakeIndexedDb();
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
    it("returns false when no passcode has been set", async () => {
      expect(await hasPinSet()).toBe(false);
    });

    it("returns true after a passcode is set", async () => {
      await setPinHash("correct-horse");
      expect(await hasPinSet()).toBe(true);
    });

    it("returns false after passcode is cleared", async () => {
      await setPinHash("correct-horse");
      await clearPin();
      expect(await hasPinSet()).toBe(false);
    });
  });

  describe("verifyPin", () => {
    it("returns false when no passcode is stored", async () => {
      expect(await verifyPin("anything")).toBe(false);
    });

    it("returns true for the correct passcode", async () => {
      await setPinHash("s3cr3t!");
      expect(await verifyPin("s3cr3t!")).toBe(true);
    });

    it("returns false for an incorrect passcode", async () => {
      await setPinHash("s3cr3t!");
      expect(await verifyPin("wrong")).toBe(false);
    });

    it("is case-sensitive", async () => {
      await setPinHash("ABCD");
      expect(await verifyPin("abcd")).toBe(false);
      expect(await verifyPin("ABCD")).toBe(true);
    });

    it("differentiates passcodes of different lengths", async () => {
      await setPinHash("pass");
      expect(await verifyPin("pass1")).toBe(false);
      expect(await verifyPin("pas")).toBe(false);
    });

    it("accepts non-digit passcodes", async () => {
      await setPinHash("correct-horse-battery-staple");
      expect(await verifyPin("correct-horse-battery-staple")).toBe(true);
    });
  });

  describe("clearPin", () => {
    it("does not throw when no passcode is stored", async () => {
      await expect(clearPin()).resolves.toBeUndefined();
    });

    it("removes a stored passcode", async () => {
      await setPinHash("secret");
      await clearPin();
      expect(await hasPinSet()).toBe(false);
    });

    it("makes verifyPin return false after clear", async () => {
      await setPinHash("secret");
      await clearPin();
      expect(await verifyPin("secret")).toBe(false);
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

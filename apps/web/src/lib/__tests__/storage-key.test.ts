import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STORAGE_KEY_RAW_ITEM,
  STORAGE_KEY_RAW_LEGACY_ITEM,
  clearPersistedStorageKey,
  getOrCreateStorageKey,
  lockPersistedStorageKey,
  protectPersistedStorageKeyWithPin,
  unlockPersistedStorageKey,
} from "@/lib/storage-key.js";

describe("storage-key", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("localStorage", createMemoryStorage());
    vi.stubGlobal("sessionStorage", createMemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("migrates legacy raw key into IndexedDB and wipes every raw storage slot", async () => {
    const idb = installFakeIndexedDb();
    const raw = new Uint8Array(32);
    webcrypto.getRandomValues(raw);
    const rawB64 = btoa(String.fromCharCode(...raw));

    localStorage.setItem(STORAGE_KEY_RAW_LEGACY_ITEM, rawB64);
    sessionStorage.setItem(STORAGE_KEY_RAW_ITEM, "stale-session-value");

    const first = await getOrCreateStorageKey();
    const second = await getOrCreateStorageKey();

    const firstRaw = await crypto.subtle.exportKey("raw", first.key);
    const secondRaw = await crypto.subtle.exportKey("raw", second.key);
    expect(new Uint8Array(firstRaw)).toEqual(new Uint8Array(secondRaw));
    expect(localStorage.getItem(STORAGE_KEY_RAW_ITEM)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY_RAW_LEGACY_ITEM)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY_RAW_ITEM)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY_RAW_LEGACY_ITEM)).toBeNull();
    expect((idb.values.get("storage-key-v2") as { extractable?: boolean } | undefined)?.extractable)
      .toBe(true);
  });

  it("falls back to runtime memory only when IndexedDB persistence is unavailable", async () => {
    installFakeIndexedDb({ failOpen: true });

    const first = await getOrCreateStorageKey();
    const second = await getOrCreateStorageKey();

    expect(first.key.extractable).toBe(true);
    expect(second.key).toBe(first.key);
    expect(localStorage.getItem(STORAGE_KEY_RAW_ITEM)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY_RAW_LEGACY_ITEM)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY_RAW_ITEM)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY_RAW_LEGACY_ITEM)).toBeNull();
  });

  it("clears volatile fallback key on clearPersistedStorageKey", async () => {
    installFakeIndexedDb({ failOpen: true });

    const first = await getOrCreateStorageKey();
    await clearPersistedStorageKey();
    const second = await getOrCreateStorageKey();

    expect(second.key).not.toBe(first.key);
  });

  it("switches the persisted storage key into PIN-locked mode and restores it on unlock", async () => {
    const idb = installFakeIndexedDb();

    const initial = await getOrCreateStorageKey();
    const initialRaw = new Uint8Array(await crypto.subtle.exportKey("raw", initial.key));

    await protectPersistedStorageKeyWithPin(initial.key, "1234");
    await lockPersistedStorageKey();

    const lockedRecord = idb.values.get("storage-key-v2") as { protection?: string } | undefined;
    expect(lockedRecord?.protection).toBe("pin");

    await expect(getOrCreateStorageKey()).rejects.toThrow("storage_key_locked");

    const unlocked = await unlockPersistedStorageKey("1234");
    const unlockedRaw = new Uint8Array(await crypto.subtle.exportKey("raw", unlocked.key));
    const unlockedFromMemory = await getOrCreateStorageKey();
    const unlockedFromMemoryRaw = new Uint8Array(
      await crypto.subtle.exportKey("raw", unlockedFromMemory.key)
    );

    expect(unlockedRaw).toEqual(initialRaw);
    expect(unlockedFromMemoryRaw).toEqual(initialRaw);
    expect(
      (idb.values.get("storage-key-v2") as { protection?: string } | undefined)
        ?.protection
    ).toBe("pin");

    vi.resetModules();
    const reloadedStorageKey = await import("@/lib/storage-key.js");
    await expect(reloadedStorageKey.getOrCreateStorageKey()).rejects.toThrow(
      "storage_key_locked"
    );
  });
});

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function installFakeIndexedDb(options?: { failOpen?: boolean }): { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  let hasStore = false;

  vi.stubGlobal("indexedDB", {
    open: () => {
      const request = createRequest<unknown>();

      queueMicrotask(() => {
        if (options?.failOpen) {
          request.error = new Error("IndexedDB unavailable");
          request.onerror?.({ target: request });
          return;
        }

        const db = createFakeIndexedDb(values, {
          hasStore: () => hasStore,
          markStoreCreated: () => {
            hasStore = true;
          },
        });

        request.result = db;
        request.onupgradeneeded?.({ target: request });
        request.onsuccess?.({ target: request });
      });

      return request;
    },
  });

  return { values };
}

function createFakeIndexedDb(
  values: Map<string, unknown>,
  storeState: { hasStore: () => boolean; markStoreCreated: () => void }
) {
  return {
    objectStoreNames: {
      contains: (name: string) => storeState.hasStore() && name === "secrets",
    },
    createObjectStore: (_name: string) => {
      storeState.markStoreCreated();
      return {};
    },
    transaction: (_name: string, _mode: string) => ({
      objectStore: () => createFakeSecretStore(values),
    }),
  };
}

function createFakeSecretStore(values: Map<string, unknown>) {
  return {
    get: (key: string) => createAsyncRequest(() => values.get(key)),
    put: (value: unknown, key: string) =>
      createAsyncRequest(() => {
        values.set(key, value);
        return key;
      }),
    delete: (key: string) =>
      createAsyncRequest(() => {
        values.delete(key);
        return undefined;
      }),
  };
}

function createAsyncRequest<T>(run: () => T) {
  const request = createRequest<T>();
  queueMicrotask(() => {
    try {
      request.result = run();
      request.onsuccess?.({ target: request });
    } catch (error) {
      request.error = error;
      request.onerror?.({ target: request });
    }
  });
  return request;
}

function createRequest<T>() {
  return {
    result: undefined as T | undefined,
    error: null as unknown,
    onsuccess: null as ((event: { target: unknown }) => void) | null,
    onerror: null as ((event: { target: unknown }) => void) | null,
    onupgradeneeded: null as ((event: { target: unknown }) => void) | null,
  };
}

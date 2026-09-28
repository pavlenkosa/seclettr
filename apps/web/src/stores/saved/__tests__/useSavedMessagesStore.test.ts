// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const wc = webcrypto;

const state = vi.hoisted(() => ({
  idb: new Map<string, Uint8Array>(),
  storageKey: null as unknown as CryptoKey,
  volatile: false,
  mode: "ok" as "ok" | "locked" | "unavailable",
  encryptFailureOnce: false,
  storeEncryptedCalls: 0,
  warn: vi.fn(),
}));

async function aesEncrypt(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = wc.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await wc.subtle.encrypt({ name: "AES-GCM", iv }, key, data)
  );
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

async function aesDecrypt(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const iv = data.slice(0, 12);
  const ct = data.slice(12);
  return new Uint8Array(await wc.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

vi.mock("@seclettr/crypto", () => ({
  storeEncrypted: async (_key: CryptoKey, itemKey: string, value: unknown) => {
    state.storeEncryptedCalls += 1;
    if (state.encryptFailureOnce) {
      state.encryptFailureOnce = false;
      throw new Error("encrypt unavailable");
    }
    state.idb.set(itemKey, await aesEncrypt(state.storageKey, utf8(JSON.stringify(value))));
  },
  loadDecrypted: async <T,>(
    key: CryptoKey,
    itemKey: string,
    options?: { onError?: (error: { code: string; itemKey: string; cause: unknown }) => void }
  ): Promise<T | null> => {
    const encrypted = state.idb.get(itemKey);
    if (!encrypted) return null;
    try {
      const json = new TextDecoder().decode(await aesDecrypt(key, encrypted));
      return JSON.parse(json) as T;
    } catch (cause) {
      options?.onError({
        code: cause instanceof Error && cause.name === "OperationError" ? "decrypt_failed" : "invalid_json",
        itemKey,
        cause,
      });
      return null;
    }
  },
  clearEncryptedByPrefix: async (prefix: string) => {
    let deleted = 0;
    for (const key of Array.from(state.idb.keys())) {
      if (key.startsWith(prefix)) {
        state.idb.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  },
}));

vi.mock("@/lib/storage-key", () => ({
  getOrCreateStorageKey: async () => {
    if (state.mode === "locked") {
      throw new Error("storage_key_locked");
    }
    if (state.mode === "unavailable") {
      throw new Error("storage_key_unavailable");
    }
    return { key: state.storageKey, volatile: state.volatile };
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: state.warn,
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { useSavedMessagesStore } from "../useSavedMessagesStore";

async function importRealCryptoKey(): Promise<CryptoKey> {
  const raw = wc.getRandomValues(new Uint8Array(32));
  return wc.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function legacyKey(userId: string): string {
  return `sc:saved:${userId}`;
}

const USER = "user-1";

beforeEach(async () => {
  state.idb.clear();
  state.storageKey = await importRealCryptoKey();
  state.volatile = false;
  state.mode = "ok";
  state.encryptFailureOnce = false;
  state.storeEncryptedCalls = 0;
  state.warn.mockClear();
  localStorage.clear();
  useSavedMessagesStore.getState().reset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useSavedMessagesStore", () => {
  it("migrates legacy plaintext into encrypted storage and removes the legacy key", async () => {
    const legacy = [
      { id: "a", content: "hello", timestamp: 1 },
      { id: "b", content: "world", timestamp: 2 },
      { notValid: true },
    ];
    localStorage.setItem(legacyKey(USER), JSON.stringify(legacy));

    await useSavedMessagesStore.getState().load(USER);

    expect(useSavedMessagesStore.getState().status).toBe("ready");
    expect(useSavedMessagesStore.getState().messages).toEqual([
      { id: "a", content: "hello", timestamp: 1 },
      { id: "b", content: "world", timestamp: 2 },
    ]);
    expect(state.idb.has(`saved:${USER}:notes`)).toBe(true);
    expect(localStorage.getItem(legacyKey(USER))).toBeNull();
    expect(state.storeEncryptedCalls).toBe(1);
  });

  it("keeps the legacy plaintext entry when encryption fails and sets status error", async () => {
    const legacy = [{ id: "a", content: "keep me", timestamp: 1 }];
    localStorage.setItem(legacyKey(USER), JSON.stringify(legacy));
    state.encryptFailureOnce = true;

    await useSavedMessagesStore.getState().load(USER);

    const s = useSavedMessagesStore.getState();
    expect(s.status).toBe("error");
    expect(s.messages).toEqual([{ id: "a", content: "keep me", timestamp: 1 }]);
    expect(localStorage.getItem(legacyKey(USER))).not.toBeNull();
    expect(state.idb.has(`saved:${USER}:notes`)).toBe(false);
  });

  it("treats tampered ciphertext as decrypt failure: status error, no re-encrypt, stable on reload", async () => {
    await useSavedMessagesStore.getState().load(USER);
    useSavedMessagesStore.getState().addMessage("secret note");
    await vi.waitFor(() => {
      expect(state.idb.has(`saved:${USER}:notes`)).toBe(true);
    });

    const blob = state.idb.get(`saved:${USER}:notes`)!;
    blob[15] = blob[15]! ^ 0xff; // flip a byte inside the ciphertext

    state.storeEncryptedCalls = 0;
    await useSavedMessagesStore.getState().load(USER);
    let s = useSavedMessagesStore.getState();
    expect(s.status).toBe("error");
    expect(s.messages).toEqual([]);
    expect(state.storeEncryptedCalls).toBe(0);

    await useSavedMessagesStore.getState().load(USER);
    s = useSavedMessagesStore.getState();
    expect(s.status).toBe("error");
    expect(state.storeEncryptedCalls).toBe(0);

    // ciphertext must be preserved
    expect(state.idb.get(`saved:${USER}:notes`)).toEqual(blob);
  });

  it("does not read or write anything when the storage key is locked", async () => {
    localStorage.setItem(legacyKey(USER), JSON.stringify([{ id: "a", content: "x", timestamp: 1 }]));
    state.mode = "locked";

    await useSavedMessagesStore.getState().load(USER);

    const s = useSavedMessagesStore.getState();
    expect(s.status).toBe("locked");
    expect(s.messages).toEqual([]);
    expect(state.idb.size).toBe(0);
    expect(localStorage.getItem(legacyKey(USER))).not.toBeNull();

    useSavedMessagesStore.getState().addMessage("should not persist");
    expect(useSavedMessagesStore.getState().messages).toHaveLength(1);
    expect(state.idb.size).toBe(0);
  });

  it("round-trips messages including attachment dataUrl through encrypted storage", async () => {
    await useSavedMessagesStore.getState().load(USER);
    const ok = await useSavedMessagesStore.getState().addMessageWithAttachment(
      new File(["binary-payload"], "clip.webm", { type: "video/webm" }),
      { kind: "video_note", durationMs: 1500 }
    );
    expect(ok).toBe(true);

    await vi.waitFor(() => {
      expect(state.idb.has(`saved:${USER}:notes`)).toBe(true);
    });

    // Simulate a fresh session: reload from encrypted storage without reset
    // (reset intentionally wipes the encrypted item — see the reset test).
    await useSavedMessagesStore.getState().load(USER);

    const s = useSavedMessagesStore.getState();
    expect(s.status).toBe("ready");
    expect(s.messages).toHaveLength(1);
    const attachment = s.messages[0]!.attachment;
    expect(attachment).toMatchObject({
      kind: "video_note",
      mimeType: "video/webm",
      fileName: "clip.webm",
      dataUrl: expect.stringContaining("data:video/webm"),
    });
  });

  it("reset deletes the encrypted item and the legacy key", async () => {
    await useSavedMessagesStore.getState().load(USER);
    useSavedMessagesStore.getState().addMessage("bye");
    await vi.waitFor(() => {
      expect(state.idb.has(`saved:${USER}:notes`)).toBe(true);
    });
    localStorage.setItem(legacyKey(USER), "stale");

    useSavedMessagesStore.getState().reset();

    expect(state.idb.size).toBe(0);
    expect(localStorage.getItem(legacyKey(USER))).toBeNull();
    expect(useSavedMessagesStore.getState().messages).toEqual([]);
  });

  it("skips persistence when the storage key is volatile and logs a warning", async () => {
    state.volatile = true;
    await useSavedMessagesStore.getState().load(USER);
    expect(useSavedMessagesStore.getState().status).toBe("ready");

    useSavedMessagesStore.getState().addMessage("memory only");

    expect(state.idb.size).toBe(0);
    expect(useSavedMessagesStore.getState().messages).toHaveLength(1);
    expect(state.warn).toHaveBeenCalled();
  });
});

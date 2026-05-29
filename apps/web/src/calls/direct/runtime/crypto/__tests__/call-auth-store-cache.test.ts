import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toBase64Url } from "@seclettr/crypto";

const mocks = vi.hoisted(() => ({
  getUserDeviceDirectory: vi.fn(),
  getAuthState: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { getUserDeviceDirectory: mocks.getUserDeviceDirectory },
}));

vi.mock("@/stores/auth", () => ({
  useAuthStore: { getState: mocks.getAuthState },
}));

vi.mock("@/lib/current-device-crypto-material", () => ({
  clearCurrentDeviceCryptoMaterialSyncCache: vi.fn(),
  ensureCurrentDeviceCryptoMaterialSynced: vi.fn().mockResolvedValue(true),
}));

import {
  clearCallAuthCache,
  getPeerDevicePublicKeyCacheSize,
  loadPeerIdentityPublicKey,
} from "@/calls/direct/runtime/crypto/call-auth-store";

const IDENTITY_KEY = new Uint8Array([1, 2, 3, 4]);
const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** Creates a unique, deterministic device ID string for test index n. */
function makeDeviceId(n: number): string {
  return `device-${String(n).padStart(6, "0")}`;
}

function mockDirectoryFor(deviceId: string) {
  mocks.getUserDeviceDirectory.mockResolvedValueOnce([
    {
      deviceId,
      identityKeyPublic: toBase64Url(IDENTITY_KEY),
      signingKeyPublic: toBase64Url(IDENTITY_KEY),
    },
  ]);
}

/** Load entry n and provide a matching mock response. */
async function loadEntry(n: number) {
  mockDirectoryFor(makeDeviceId(n));
  return loadPeerIdentityPublicKey(USER_ID, makeDeviceId(n));
}

describe("peerDevicePublicKeyCache LRU eviction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCallAuthCache();
    mocks.getAuthState.mockReturnValue({ userId: USER_ID });
  });

  afterEach(() => {
    clearCallAuthCache();
  });

  it("returns cached value without a second API call on cache hit", async () => {
    mockDirectoryFor(makeDeviceId(1));
    const first = await loadPeerIdentityPublicKey(USER_ID, makeDeviceId(1));
    const second = await loadPeerIdentityPublicKey(USER_ID, makeDeviceId(1));

    expect(first).toEqual(IDENTITY_KEY);
    expect(second).toEqual(IDENTITY_KEY);
    expect(mocks.getUserDeviceDirectory).toHaveBeenCalledTimes(1);
  });

  it("keeps cache size at MAX after adding beyond the limit", async () => {
    // Fill 100 entries — one API call each.
    for (let i = 0; i < 100; i++) {
      await loadEntry(i);
    }
    expect(getPeerDevicePublicKeyCacheSize()).toBe(100);
    expect(mocks.getUserDeviceDirectory).toHaveBeenCalledTimes(100);

    // 101st entry: should trigger eviction so size stays at 100.
    await loadEntry(100);
    expect(getPeerDevicePublicKeyCacheSize()).toBe(100);
    expect(mocks.getUserDeviceDirectory).toHaveBeenCalledTimes(101);

    // 102nd entry: eviction again — still 100.
    await loadEntry(101);
    expect(getPeerDevicePublicKeyCacheSize()).toBe(100);
    expect(mocks.getUserDeviceDirectory).toHaveBeenCalledTimes(102);
  });

  it("evicts the oldest entry, not a recently loaded one", async () => {
    // Fill entries 0..99.
    for (let i = 0; i < 100; i++) {
      await loadEntry(i);
    }
    // Touch entry 0 (most-recently used).
    await loadPeerIdentityPublicKey(USER_ID, makeDeviceId(0));
    // entry 0 was a cache hit — no new API call.
    expect(mocks.getUserDeviceDirectory).toHaveBeenCalledTimes(100);

    // Adding entry 100: oldest is now entry 1 (entry 0 was LRU-touched).
    await loadEntry(100);
    expect(mocks.getUserDeviceDirectory).toHaveBeenCalledTimes(101);
    expect(getPeerDevicePublicKeyCacheSize()).toBe(100);

    // Entry 0 should still be cached — no new API call.
    const callsBefore = mocks.getUserDeviceDirectory.mock.calls.length;
    await loadPeerIdentityPublicKey(USER_ID, makeDeviceId(0));
    expect(mocks.getUserDeviceDirectory.mock.calls.length).toBe(callsBefore);

    // Entry 1 was evicted — re-loading triggers a new API call.
    await loadEntry(1);
    expect(mocks.getUserDeviceDirectory.mock.calls.length).toBe(callsBefore + 1);
  });

  it("updating an existing entry (LRU touch) does not grow size beyond MAX", async () => {
    // Fill to exactly 100.
    for (let i = 0; i < 100; i++) {
      await loadEntry(i);
    }
    expect(getPeerDevicePublicKeyCacheSize()).toBe(100);

    // Re-load entry 0 (cache hit — LRU touch, no API call).
    await loadPeerIdentityPublicKey(USER_ID, makeDeviceId(0));
    // Size must not grow beyond 100 — a cache touch is not an insert.
    expect(getPeerDevicePublicKeyCacheSize()).toBe(100);
    expect(mocks.getUserDeviceDirectory).toHaveBeenCalledTimes(100);

    // Add a new entry — evicts the oldest (entry 1 after touching entry 0).
    await loadEntry(100);
    expect(getPeerDevicePublicKeyCacheSize()).toBe(100);
  });
});

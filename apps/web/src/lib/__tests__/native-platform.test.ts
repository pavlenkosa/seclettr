// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockNativeStorageGet = vi.fn();
const mockNativeStorageSet = vi.fn();
const mockNativeStorageRemove = vi.fn();
const mockCapacitorIsNativePlatform = vi.fn(() => true);
const mockCapacitorIsPluginAvailable = vi.fn(() => true);

vi.mock("../native-storage", () => ({
  nativeStorageGet: mockNativeStorageGet,
  nativeStorageSet: mockNativeStorageSet,
  nativeStorageRemove: mockNativeStorageRemove,
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: mockCapacitorIsNativePlatform,
    isPluginAvailable: mockCapacitorIsPluginAvailable,
  },
}));

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
  } as Storage;
}

describe("native-platform", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", createMemoryStorage());
    mockNativeStorageGet.mockReset();
    mockNativeStorageSet.mockReset();
    mockNativeStorageRemove.mockReset();
    mockCapacitorIsNativePlatform.mockReset();
    mockCapacitorIsNativePlatform.mockReturnValue(true);
    mockCapacitorIsPluginAvailable.mockReset();
    mockCapacitorIsPluginAvailable.mockReturnValue(true);
  });

  it("hydrates the sync native server URL from Preferences for cold-start boot", async () => {
    mockNativeStorageGet.mockResolvedValue("https://server.example/");

    const {
      getNativeServerUrl,
      hydrateNativeServerUrlForBoot,
    } = await import("../native-platform");

    expect(getNativeServerUrl()).toBeNull();
    await expect(hydrateNativeServerUrlForBoot()).resolves.toBe("https://server.example");
    expect(getNativeServerUrl()).toBe("https://server.example");
  });

  it("keeps the existing sync boot URL when already present", async () => {
    localStorage.setItem("sc:native_server_url", "https://cached.example");

    const {
      hydrateNativeServerUrlForBoot,
    } = await import("../native-platform");

    await expect(hydrateNativeServerUrlForBoot()).resolves.toBe("https://cached.example");
    expect(mockNativeStorageGet).not.toHaveBeenCalled();
  });
});

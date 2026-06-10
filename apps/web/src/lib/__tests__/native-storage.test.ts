import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsNativePlatform = vi.fn(() => false);
const mockIsNativePluginAvailable = vi.fn(() => false);
const mockPreferencesGet = vi.fn();
const mockPreferencesSet = vi.fn();
const mockPreferencesRemove = vi.fn();

vi.mock("@/lib/native-platform", () => ({
  isNativePlatform: mockIsNativePlatform,
  isNativePluginAvailable: mockIsNativePluginAvailable,
}));

vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: mockPreferencesGet,
    set: mockPreferencesSet,
    remove: mockPreferencesRemove,
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

describe("native-storage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", createMemoryStorage());
    mockIsNativePlatform.mockReset();
    mockIsNativePlatform.mockReturnValue(false);
    mockIsNativePluginAvailable.mockReset();
    mockIsNativePluginAvailable.mockReturnValue(false);
    mockPreferencesGet.mockReset();
    mockPreferencesSet.mockReset();
    mockPreferencesRemove.mockReset();
  });

  it("uses Capacitor Preferences on native platforms", async () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockIsNativePluginAvailable.mockReturnValue(true);
    mockPreferencesGet.mockResolvedValue({ value: "native-value" });
    mockPreferencesSet.mockResolvedValue(undefined);
    mockPreferencesRemove.mockResolvedValue(undefined);

    const {
      nativeStorageGet,
      nativeStorageSet,
      nativeStorageRemove,
    } = await import("@/lib/native-storage");

    await expect(nativeStorageSet("key-1", "value-1")).resolves.toBeUndefined();
    await expect(nativeStorageGet("key-1")).resolves.toBe("native-value");
    await expect(nativeStorageRemove("key-1")).resolves.toBeUndefined();

    expect(mockPreferencesSet).toHaveBeenCalledWith({ key: "key-1", value: "value-1" });
    expect(mockPreferencesGet).toHaveBeenCalledWith({ key: "key-1" });
    expect(mockPreferencesRemove).toHaveBeenCalledWith({ key: "key-1" });
  });

  it("retries native Preferences reads until the plugin becomes available on cold start", async () => {
    mockIsNativePlatform.mockReturnValue(true);
    mockIsNativePluginAvailable
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    mockPreferencesGet.mockResolvedValue({ value: "late-native-value" });

    const { nativeStorageGet } = await import("@/lib/native-storage");

    await expect(nativeStorageGet("key-boot")).resolves.toBe("late-native-value");
    expect(mockPreferencesGet).toHaveBeenCalledTimes(1);
    expect(mockPreferencesGet).toHaveBeenCalledWith({ key: "key-boot" });
  });

  it("falls back to localStorage on non-native platforms", async () => {
    const {
      nativeStorageGet,
      nativeStorageSet,
      nativeStorageRemove,
    } = await import("@/lib/native-storage");

    await nativeStorageSet("key-2", "value-2");
    await expect(nativeStorageGet("key-2")).resolves.toBe("value-2");
    await nativeStorageRemove("key-2");
    await expect(nativeStorageGet("key-2")).resolves.toBeNull();

    expect(mockPreferencesSet).not.toHaveBeenCalled();
    expect(mockPreferencesGet).not.toHaveBeenCalled();
    expect(mockPreferencesRemove).not.toHaveBeenCalled();
  });
});

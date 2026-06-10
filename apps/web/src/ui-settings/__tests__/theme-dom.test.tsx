// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MemoryStorageState {
  values: Map<string, string>;
}

function createMemoryStorage(): Storage & MemoryStorageState {
  const values = new Map<string, string>();
  return {
    values,
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

async function loadUiSettingsModule() {
  vi.resetModules();
  return import("../index");
}

describe("ui-settings DOM theme resolution", () => {
  let localStorageState: Storage & MemoryStorageState;
  let sessionStorageState: Storage & MemoryStorageState;
  let originalMatchMedia: typeof globalThis.matchMedia | undefined;

  beforeEach(() => {
    localStorageState = createMemoryStorage();
    sessionStorageState = createMemoryStorage();
    vi.stubGlobal("localStorage", localStorageState);
    vi.stubGlobal("sessionStorage", sessionStorageState);
    originalMatchMedia = globalThis.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      }),
    });
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-accent");
    document.documentElement.removeAttribute("data-font-size");
    document.documentElement.removeAttribute("data-call-security-mode");
    document.documentElement.removeAttribute("style");
  });

  afterEach(() => {
    if (originalMatchMedia) {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    } else {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: undefined,
      });
    }
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-accent");
    document.documentElement.removeAttribute("data-font-size");
    document.documentElement.removeAttribute("data-call-security-mode");
    document.documentElement.removeAttribute("style");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("publishes light DOM theme for light custom backgrounds while preserving custom mode in state", async () => {
    localStorageState.setItem("seclettr.ui.theme.v1", "custom");
    localStorageState.setItem("seclettr.ui.custom.bg.v1", "#f2f6fb");
    localStorageState.setItem("seclettr.ui.custom.accent.v1", "#3b82f6");

    const { useUiSettingsStore } = await loadUiSettingsModule();

    expect(useUiSettingsStore.getState().themeMode).toBe("custom");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("updates the DOM theme when custom backgrounds cross between dark and light", async () => {
    localStorageState.setItem("seclettr.ui.theme.v1", "custom");
    localStorageState.setItem("seclettr.ui.custom.bg.v1", "#0b1526");
    localStorageState.setItem("seclettr.ui.custom.accent.v1", "#3b82f6");

    const { useUiSettingsStore } = await loadUiSettingsModule();

    expect(document.documentElement.dataset.theme).toBe("dark");

    useUiSettingsStore.getState().setCustomThemeBg("#f7f9fd");
    expect(useUiSettingsStore.getState().themeMode).toBe("custom");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");

    useUiSettingsStore.getState().setCustomThemeBg("#101828");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});

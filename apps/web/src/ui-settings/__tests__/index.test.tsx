// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UiSettingsProvider,
  useAppearanceSettings,
  useAudioOutputSettings,
  useSecuritySettings,
} from "@/ui-settings";

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

function AppearanceHarness(props: {
  hookRef: MutableRefObject<ReturnType<typeof useAppearanceSettings> | null>;
  onRender: () => void;
}) {
  props.onRender();
  props.hookRef.current = useAppearanceSettings();
  return null;
}

function SecurityHarness(props: {
  hookRef: MutableRefObject<ReturnType<typeof useSecuritySettings> | null>;
  onRender: () => void;
}) {
  props.onRender();
  props.hookRef.current = useSecuritySettings();
  return null;
}

function AudioHarness(props: {
  hookRef: MutableRefObject<ReturnType<typeof useAudioOutputSettings> | null>;
  onRender: () => void;
}) {
  props.onRender();
  props.hookRef.current = useAudioOutputSettings();
  return null;
}

describe("UiSettingsProvider", () => {
  let container: HTMLDivElement;
  let root: Root;
  let localStorageState: Storage & MemoryStorageState;
  let sessionStorageState: Storage & MemoryStorageState;
  let originalMatchMedia: typeof globalThis.globalThis.matchMedia | undefined;
  let appearanceRef: MutableRefObject<ReturnType<typeof useAppearanceSettings> | null>;
  let securityRef: MutableRefObject<ReturnType<typeof useSecuritySettings> | null>;
  let audioRef: MutableRefObject<ReturnType<typeof useAudioOutputSettings> | null>;
  let appearanceRenderCount: number;
  let securityRenderCount: number;
  let audioRenderCount: number;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

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

    appearanceRef = { current: null };
    securityRef = { current: null };
    audioRef = { current: null };
    appearanceRenderCount = 0;
    securityRenderCount = 0;
    audioRenderCount = 0;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
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
    vi.unstubAllGlobals();
    delete (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT;
  });

  it("keeps domain-specific consumers isolated from unrelated settings changes", () => {
    act(() => {
      root.render(
        <UiSettingsProvider>
          <AppearanceHarness
            hookRef={appearanceRef}
            onRender={() => {
              appearanceRenderCount += 1;
            }}
          />
          <SecurityHarness
            hookRef={securityRef}
            onRender={() => {
              securityRenderCount += 1;
            }}
          />
          <AudioHarness
            hookRef={audioRef}
            onRender={() => {
              audioRenderCount += 1;
            }}
          />
        </UiSettingsProvider>
      );
    });

    expect(appearanceRenderCount).toBe(1);
    expect(securityRenderCount).toBe(1);
    expect(audioRenderCount).toBe(1);

    act(() => {
      appearanceRef.current?.setThemeMode("light");
    });

    expect(appearanceRenderCount).toBe(2);
    expect(securityRenderCount).toBe(1);
    expect(audioRenderCount).toBe(1);

    act(() => {
      securityRef.current?.setAutoDecryptMedia("off");
    });

    expect(appearanceRenderCount).toBe(2);
    expect(securityRenderCount).toBe(2);
    expect(audioRenderCount).toBe(1);

    act(() => {
      audioRef.current?.setAudioOutputPreference("device:headset");
    });

    expect(appearanceRenderCount).toBe(2);
    expect(securityRenderCount).toBe(2);
    expect(audioRenderCount).toBe(2);

    expect(localStorageState.values.get("seclettr.ui.theme.v1")).toBe("light");
    expect(localStorageState.values.get("seclettr.ui.autoDecryptMedia.v1")).toBe("off");
    expect(localStorageState.values.get("seclettr.ui.audioOutputPreference.v1")).toBe("device:headset");
  });
});

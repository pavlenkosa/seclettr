// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface BackButtonPlugin {
  addListener: (event: string, handler: (data: { canGoBack: boolean }) => void) => Promise<{ remove: () => void }>;
  exitApp: () => Promise<void>;
}

async function loadModule() {
  vi.resetModules();
  return import("../native-back-handler");
}

describe("native-back-handler", () => {
  beforeEach(() => {
    Object.defineProperty(window, "Capacitor", {
      configurable: true,
      value: undefined,
    });
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(window, "Capacitor");
    window.history.replaceState(null, "", "/");
  });

  it("registers the back button listener from Capacitor.App and navigates back for an active thread", async () => {
    let backButtonHandler: ((data: { canGoBack: boolean }) => void) | null = null;
    const exitApp = vi.fn(async () => {});
    const addListener = vi.fn(async (_event: string, handler: (data: { canGoBack: boolean }) => void) => {
      backButtonHandler = handler;
      return { remove: () => {} };
    });

    Object.defineProperty(window, "Capacitor", {
      configurable: true,
      value: {
        isNativePlatform: () => true,
        App: {
          addListener,
          exitApp,
        } satisfies BackButtonPlugin,
      },
    });

    window.history.pushState(null, "", "/?chat=user-1");
    const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {});

    const { initNativeBackHandler } = await loadModule();
    initNativeBackHandler();

    expect(addListener).toHaveBeenCalledWith("backButton", expect.any(Function));
    expect(backButtonHandler).not.toBeNull();

    backButtonHandler?.({ canGoBack: false });

    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(exitApp).not.toHaveBeenCalled();
  });

  it("still supports the legacy Capacitor.Plugins.App bridge shape", async () => {
    const exitApp = vi.fn(async () => {});
    const addListener = vi.fn(async () => ({ remove: () => {} }));

    Object.defineProperty(window, "Capacitor", {
      configurable: true,
      value: {
        isNativePlatform: () => true,
        Plugins: {
          App: {
            addListener,
            exitApp,
          } satisfies BackButtonPlugin,
        },
      },
    });

    const { initNativeBackHandler } = await loadModule();
    initNativeBackHandler();

    expect(addListener).toHaveBeenCalledWith("backButton", expect.any(Function));
  });
});

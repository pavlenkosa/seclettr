// @vitest-environment jsdom

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppForegroundResync } from "../useAppForegroundResync";

const mocks = vi.hoisted(() => ({
  refreshSessionAccessToken: vi.fn(async () => "token-1"),
  disconnect: vi.fn(),
  connect: vi.fn(),
  isNativePlatform: vi.fn(() => false),
  addAppListener: vi.fn(),
}));

vi.mock("../session", () => ({
  refreshSessionAccessToken: mocks.refreshSessionAccessToken,
}));

vi.mock("../websocket", () => ({
  wsClient: {
    disconnect: mocks.disconnect,
    connect: mocks.connect,
  },
}));

vi.mock("../native-platform", () => ({
  isNativePlatform: mocks.isNativePlatform,
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: mocks.addAppListener,
  },
}));

type HarnessProps = {
  readonly isReady: boolean;
};

function HookHarness({ isReady }: HarnessProps) {
  useAppForegroundResync(isReady);
  return null;
}

describe("useAppForegroundResync", () => {
  let container: HTMLDivElement;
  let root: Root;
  let visibilityState: DocumentVisibilityState;
  let visibilityListeners: Set<EventListener>;
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    visibilityState = "hidden";
    visibilityListeners = new Set<EventListener>();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibilityState,
    });

    addEventListenerSpy = vi.spyOn(document, "addEventListener");
    addEventListenerSpy.mockImplementation((eventName, listener, options) => {
      if (eventName === "visibilitychange" && typeof listener === "function") {
        visibilityListeners.add(listener);
      }
      return EventTarget.prototype.addEventListener.call(document, eventName, listener, options);
    });

    removeEventListenerSpy = vi.spyOn(document, "removeEventListener");
    removeEventListenerSpy.mockImplementation((eventName, listener, options) => {
      if (eventName === "visibilitychange" && typeof listener === "function") {
        visibilityListeners.delete(listener);
      }
      return EventTarget.prototype.removeEventListener.call(document, eventName, listener, options);
    });

    mocks.refreshSessionAccessToken.mockClear();
    mocks.disconnect.mockClear();
    mocks.connect.mockClear();
    mocks.isNativePlatform.mockReset();
    mocks.isNativePlatform.mockReturnValue(false);
    mocks.addAppListener.mockReset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
    vi.restoreAllMocks();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  function renderHook(isReady: boolean) {
    act(() => {
      root.render(React.createElement(HookHarness, { isReady }));
    });
  }

  it("removes the visibilitychange listener across ready transitions", async () => {
    renderHook(true);
    expect(visibilityListeners.size).toBe(1);

    renderHook(false);
    expect(visibilityListeners.size).toBe(0);

    visibilityState = "visible";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(mocks.refreshSessionAccessToken).not.toHaveBeenCalled();

    // Mock Date.now before re-activation so the debounce initialisation captures
    // a controlled baseline (t=0). The event fires at t=3001 which exceeds the
    // 3000ms debounce window → resync should fire.
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(0);
    renderHook(true);
    expect(visibilityListeners.size).toBe(1);

    nowSpy.mockReturnValue(3_001);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    expect(mocks.refreshSessionAccessToken).toHaveBeenCalledTimes(1);
    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    expect(mocks.connect).toHaveBeenCalledWith("token-1");
  });

  it("removes a late native listener if cleanup happens before registration resolves", async () => {
    mocks.isNativePlatform.mockReturnValue(true);

    let resolveListener: ((listener: { remove: () => Promise<void> }) => void) | null = null;
    const remove = vi.fn(async () => {});
    mocks.addAppListener.mockImplementation(() => new Promise((resolve) => {
      resolveListener = resolve;
    }));

    renderHook(true);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.addAppListener).toHaveBeenCalledWith("appStateChange", expect.any(Function));

    renderHook(false);

    await act(async () => {
      resolveListener?.({ remove });
      await Promise.resolve();
    });

    expect(remove).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = {
  get: vi.fn(),
  post: vi.fn(),
};

type LocalStorageMock = {
  store: Map<string, string>;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

vi.mock("@/lib/api", () => ({
  api: apiMock,
}));

describe("push", () => {
  beforeEach(() => {
    const localStorageMock: LocalStorageMock = {
      store: new Map<string, string>(),
      getItem(key: string) {
        return this.store.has(key) ? this.store.get(key) ?? null : null;
      },
      setItem(key: string, value: string) {
        this.store.set(key, value);
      },
      removeItem(key: string) {
        this.store.delete(key);
      },
      clear() {
        this.store.clear();
      },
    };
    vi.stubGlobal("localStorage", localStorageMock);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    localStorage.clear();
    apiMock.get.mockReset();
    apiMock.post.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("reports unsupported status when browser push primitives are missing", async () => {
    const originalServiceWorker = navigator.serviceWorker;
    Reflect.deleteProperty(navigator, "serviceWorker");
    Reflect.deleteProperty(window, "PushManager");
    Reflect.deleteProperty(window, "Notification");

    const { getPushClientStatus } = await import("@/lib/push");
    await expect(getPushClientStatus()).resolves.toEqual({
      supported: false,
      browserEnabled: false,
      permission: "unsupported",
      subscribed: false,
      pushConfigured: false,
      platformHint: "none",
    });

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: originalServiceWorker,
    });
  });

  it("respects local browser opt-out for automatic subscription", async () => {
    Object.defineProperty(window, "PushManager", {
      configurable: true,
      value: function PushManager() {},
    });
    const requestPermission = vi.fn().mockResolvedValue("granted");
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: {
        permission: "granted",
        requestPermission,
      },
    });
    vi.stubGlobal("Notification", globalThis.Notification);

    const getSubscription = vi.fn().mockResolvedValue(null);
    const subscribe = vi.fn().mockResolvedValue({
      toJSON: () => ({
        endpoint: "https://push.example/subscription",
        keys: {
          p256dh: "p256dh",
          auth: "auth",
        },
      }),
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue(null),
        register: vi.fn().mockResolvedValue({
          pushManager: {
            getSubscription,
            subscribe,
          },
        }),
      },
    });
    apiMock.get.mockResolvedValue({ vapidPublicKey: "BElfakeKey-1234" });
    apiMock.post.mockResolvedValue(undefined);

    const push = await import("@/lib/push");
    await push.disablePushForBrowser();
    await push.ensurePushSubscription();

    expect(subscribe).not.toHaveBeenCalled();
    expect(apiMock.post).not.toHaveBeenCalledWith(
      "/push/subscriptions",
      expect.anything()
    );
  });

  it("loads browser status using current subscription state and server config check", async () => {
    Object.defineProperty(window, "PushManager", {
      configurable: true,
      value: function PushManager() {},
    });
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: {
        permission: "granted",
        requestPermission: vi.fn().mockResolvedValue("granted"),
      },
    });
    vi.stubGlobal("Notification", globalThis.Notification);

    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue({
              endpoint: "https://push.example/subscription",
            }),
          },
        }),
        register: vi.fn(),
      },
    });
    apiMock.get.mockResolvedValue({ vapidPublicKey: "BElfakeKey-1234" });

    const { getPushClientStatus } = await import("@/lib/push");
    await expect(getPushClientStatus()).resolves.toEqual({
      supported: true,
      browserEnabled: true,
      permission: "granted",
      subscribed: true,
      pushConfigured: true,
      platformHint: "none",
    });
  });

  it("surfaces iOS Safari install hint when push primitives are unavailable in browser tab mode", async () => {
    vi.stubGlobal("window", {
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });

    const { getPushClientStatus } = await import("@/lib/push");
    await expect(getPushClientStatus()).resolves.toEqual({
      supported: false,
      browserEnabled: false,
      permission: "unsupported",
      subscribed: false,
      pushConfigured: false,
      platformHint: "ios-install-app",
    });
  });
});

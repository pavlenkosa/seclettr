import { afterEach, describe, expect, it, vi } from "vitest";
import { detectLocalDirectCallMediaEncryptionModes } from "@/calls/direct/model/call-media-encryption-negotiation";
import { resolveDirectCallFrameCompatibilityPolicy } from "@/calls/direct/model/direct-call-media-encryption-compatibility";

describe("direct-call-media-encryption-compatibility", () => {
  const originalWindow = globalThis.window;
  const originalNavigator = globalThis.navigator;
  const originalSender = globalThis.RTCRtpSender;
  const originalReceiver = globalThis.RTCRtpReceiver;
  const originalWorker = globalThis.Worker;
  const originalScriptTransform = "RTCRtpScriptTransform" in globalThis
    ? (globalThis as typeof globalThis & { RTCRtpScriptTransform?: unknown }).RTCRtpScriptTransform
    : undefined;

  afterEach(() => {
    vi.restoreAllMocks();

    if (originalWindow) {
      vi.stubGlobal("window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }

    if (originalNavigator) {
      vi.stubGlobal("navigator", originalNavigator);
    } else {
      Reflect.deleteProperty(globalThis, "navigator");
    }

    if (originalSender) {
      vi.stubGlobal("RTCRtpSender", originalSender);
    } else {
      Reflect.deleteProperty(globalThis, "RTCRtpSender");
    }

    if (originalReceiver) {
      vi.stubGlobal("RTCRtpReceiver", originalReceiver);
    } else {
      Reflect.deleteProperty(globalThis, "RTCRtpReceiver");
    }

    if (originalWorker) {
      vi.stubGlobal("Worker", originalWorker);
    } else {
      Reflect.deleteProperty(globalThis, "Worker");
    }

    if (originalScriptTransform === undefined) {
      Reflect.deleteProperty(globalThis, "RTCRtpScriptTransform");
    } else {
      Object.defineProperty(globalThis, "RTCRtpScriptTransform", {
        configurable: true,
        writable: true,
        value: originalScriptTransform,
      });
    }
  });

  function installScriptTransformSupport() {
    class MockSender {}
    class MockReceiver {}
    class MockWorker {}
    class MockScriptTransform {
      constructor(_worker: Worker, _options?: unknown) {}
    }

    Object.defineProperty(MockSender.prototype, "transform", {
      configurable: true,
      get() {
        return undefined;
      },
      set(_value: unknown) {
        return undefined;
      },
    });
    Object.defineProperty(MockReceiver.prototype, "transform", {
      configurable: true,
      get() {
        return undefined;
      },
      set(_value: unknown) {
        return undefined;
      },
    });

    vi.stubGlobal("RTCRtpSender", MockSender);
    vi.stubGlobal("RTCRtpReceiver", MockReceiver);
    vi.stubGlobal("Worker", MockWorker);
    Object.defineProperty(globalThis, "RTCRtpScriptTransform", {
      configurable: true,
      writable: true,
      value: MockScriptTransform,
    });
  }

  function installBrowserContext(params: {
    userAgent: string;
    isNativePlatform?: boolean;
  }) {
    const windowValue: Record<string, unknown> = {};
    if (params.isNativePlatform) {
      windowValue["Capacitor"] = {
        isNativePlatform: () => true,
      };
    }

    vi.stubGlobal("window", windowValue);
    vi.stubGlobal("navigator", {
      userAgent: params.userAgent,
    });
  }

  it("denies frame-v1 for iOS WebKit browser runtimes", () => {
    expect(resolveDirectCallFrameCompatibilityPolicy({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      isNativePlatform: false,
    })).toEqual({
      allowFrameMode: false,
      reason: "ios-webkit-browser",
    });
  });

  it("allows frame-v1 for native runtimes even with iOS WebKit user agents", () => {
    expect(resolveDirectCallFrameCompatibilityPolicy({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      isNativePlatform: true,
    })).toEqual({
      allowFrameMode: true,
      reason: null,
    });
  });

  it("filters local direct-call support to transport on iOS WebKit browsers", () => {
    installBrowserContext({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/135.0.0.0 Mobile/15E148 Safari/604.1",
    });
    installScriptTransformSupport();

    expect(detectLocalDirectCallMediaEncryptionModes()).toEqual(["transport"]);
  });

  it("still advertises frame-v1 on non-iOS browsers with transform support", () => {
    installBrowserContext({
      userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Mobile Safari/537.36",
    });
    installScriptTransformSupport();

    expect(detectLocalDirectCallMediaEncryptionModes()).toEqual(["frame-v1", "transport"]);
  });
});

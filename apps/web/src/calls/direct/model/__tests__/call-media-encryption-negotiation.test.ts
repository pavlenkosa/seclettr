import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDirectCallMediaEncryptionOffer,
  detectLocalDirectCallMediaEncryptionModes,
  negotiateDirectCallMediaEncryptionMode,
  resolveLegacyDirectCallMediaEncryptionOffer,
  resolvePreferredDirectCallMediaEncryptionMode,
  validateDirectCallMediaEncryptionAnswer,
} from "@/calls/direct/model/call-media-encryption-negotiation";

describe("call-media-encryption-negotiation", () => {
  const originalWindow = globalThis.window;
  const originalSender = globalThis.RTCRtpSender;
  const originalReceiver = globalThis.RTCRtpReceiver;
  const originalWorker = globalThis.Worker;
  const originalScriptTransform = "RTCRtpScriptTransform" in globalThis
    ? (globalThis as typeof globalThis & { RTCRtpScriptTransform?: unknown }).RTCRtpScriptTransform
    : undefined;

  afterEach(() => {
    if (originalWindow) {
      vi.stubGlobal("window", originalWindow);
    } else {
      vi.unstubAllGlobals();
    }

    if (originalSender) {
      vi.stubGlobal("RTCRtpSender", originalSender);
    }

    if (originalReceiver) {
      vi.stubGlobal("RTCRtpReceiver", originalReceiver);
    }

    if (originalWorker) {
      vi.stubGlobal("Worker", originalWorker);
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

  it("keeps transport as default preferred mode when frame mode is unavailable", () => {
    const preferred = resolvePreferredDirectCallMediaEncryptionMode("balanced", ["transport"]);
    expect(preferred).toBe("transport");
  });

  it("uses frame mode when both peers prefer frame and support it", () => {
    const selected = negotiateDirectCallMediaEncryptionMode(
      {
        preferredMode: "frame-v1",
        supportedModes: ["frame-v1", "transport"],
      },
      ["frame-v1", "transport"],
      { localPreferredMode: "frame-v1" }
    );
    expect(selected).toBe("frame-v1");
  });

  it("falls back to transport when callee prefers compatibility", () => {
    const selected = negotiateDirectCallMediaEncryptionMode(
      {
        preferredMode: "frame-v1",
        supportedModes: ["frame-v1", "transport"],
      },
      ["frame-v1", "transport"],
      { localPreferredMode: "transport" }
    );
    expect(selected).toBe("transport");
  });

  it("accepts a transport answer when a compatibility callee still advertises frame support", () => {
    const accepted = validateDirectCallMediaEncryptionAnswer(
      {
        preferredMode: "frame-v1",
        supportedModes: ["frame-v1", "transport"],
      },
      {
        selectedMode: "transport",
        supportedModes: ["frame-v1", "transport"],
      }
    );
    expect(accepted).toBe("transport");
  });

  it("falls back to common mode when preferred mode is unsupported by callee", () => {
    const selected = negotiateDirectCallMediaEncryptionMode(
      {
        preferredMode: "frame-v1",
        supportedModes: ["frame-v1", "transport"],
      },
      ["transport"],
      { localPreferredMode: "transport" }
    );
    expect(selected).toBe("transport");
  });

  it("returns null when peers have no common modes", () => {
    const selected = negotiateDirectCallMediaEncryptionMode(
      {
        preferredMode: "frame-v1",
        supportedModes: ["frame-v1"],
      },
      ["transport"]
    );
    expect(selected).toBeNull();
  });

  it("builds legacy-compatible transport-only offer", () => {
    const offer = resolveLegacyDirectCallMediaEncryptionOffer();
    expect(offer).toEqual({
      preferredMode: "transport",
      supportedModes: ["transport"],
    });
  });

  it("builds offer using caller security mode + local support", () => {
    const offer = buildDirectCallMediaEncryptionOffer("compatibility", ["frame-v1", "transport"]);
    expect(offer).toEqual({
      preferredMode: "transport",
      supportedModes: ["frame-v1", "transport"],
    });
  });

  it("advertises frame-v1 when balanced mode supports it locally", () => {
    const offer = buildDirectCallMediaEncryptionOffer("balanced", ["frame-v1", "transport"]);
    expect(offer).toEqual({
      preferredMode: "frame-v1",
      supportedModes: ["frame-v1", "transport"],
    });
  });

  it("advertises frame-v1 when strict mode supports it locally", () => {
    const offer = buildDirectCallMediaEncryptionOffer("strict", ["frame-v1", "transport"]);
    expect(offer).toEqual({
      preferredMode: "frame-v1",
      supportedModes: ["frame-v1", "transport"],
    });
  });

  it("detects frame-v1 support when only RTCRtpScriptTransform is available", () => {
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

    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("RTCRtpSender", MockSender);
    vi.stubGlobal("RTCRtpReceiver", MockReceiver);
    vi.stubGlobal("Worker", MockWorker);
    Object.defineProperty(globalThis, "RTCRtpScriptTransform", {
      configurable: true,
      writable: true,
      value: MockScriptTransform,
    });

    expect(detectLocalDirectCallMediaEncryptionModes()).toEqual(["frame-v1", "transport"]);
  });
});

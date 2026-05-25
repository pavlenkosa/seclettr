import { describe, expect, it, vi, beforeEach } from "vitest";
import { detectLocalDirectCallMediaEncryptionModes } from "@/calls/direct/model/call-media-encryption-negotiation";
import type { IncomingCall } from "@/calls/direct/model/direct-call-types";
import { prepareInboundOfferAcceptance } from "@/calls/direct/runtime/setup/accept-call-offer-runtime";

const verifyIncomingCallOffer = vi.hoisted(() => vi.fn());

vi.mock("@/calls/direct/runtime/crypto/call-auth-actions", () => ({
  verifyIncomingCallOffer,
}));

function createIncomingCall(overrides?: Partial<IncomingCall>): IncomingCall {
  return {
    callId: "call-incoming",
    callerUserId: "peer-2",
    callerDeviceId: "device-2",
    callerLabel: "Peer Two",
    callType: "video",
    targetUserId: "user-1",
    offerSdp: "offer-sdp",
    mediaEncryptionOffer: {
      preferredMode: "transport",
      supportedModes: ["transport"],
    },
    supportsRenegotiationV1: true,
    auth: undefined,
    ...overrides,
  };
}

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

function installIosWebKitBrowserGlobals() {
  vi.stubGlobal("window", {});
  vi.stubGlobal("navigator", {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
}

describe("prepareInboundOfferAcceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyIncomingCallOffer.mockResolvedValue({ state: "verified" });
  });

  it("rejects invalid inbound offers before media bootstrap", async () => {
    const rejectInboundSetup = vi.fn();
    verifyIncomingCallOffer.mockResolvedValue({ state: "invalid" });

    const result = await prepareInboundOfferAcceptance({
      currentIncoming: createIncomingCall(),
      callSecurityMode: "strict",
      resolveLocalSupportedMediaEncryptionModes: () => ["transport"],
      finishCallSession: vi.fn(),
      pushNotice: vi.fn(),
      t: (key: string) => key,
      rejectInboundSetup,
    });

    expect(result).toBeNull();
    expect(rejectInboundSetup).toHaveBeenCalledWith(expect.objectContaining({
      callId: "call-incoming",
      reasonKey: "call.error.unableVerifyCode",
    }));
  });

  it("allows degraded balanced-mode offers and keeps the negotiated media mode", async () => {
    const pushNotice = vi.fn();
    verifyIncomingCallOffer.mockResolvedValue({ state: "unverified" });

    const result = await prepareInboundOfferAcceptance({
      currentIncoming: createIncomingCall(),
      callSecurityMode: "balanced",
      resolveLocalSupportedMediaEncryptionModes: () => ["transport"],
      finishCallSession: vi.fn(),
      pushNotice,
      t: (key: string) => key,
      rejectInboundSetup: vi.fn(),
    });

    expect(result).toEqual(expect.objectContaining({
      offerVerification: { state: "unverified" },
      localSupportedMediaEncryptionModes: ["transport"],
      selectedMediaEncryptionMode: "transport",
    }));
    expect(pushNotice).toHaveBeenCalledWith({
      kind: "error",
      message: "call.error.unableVerifyCode",
    });
  });

  it("selects transport on iOS WebKit browser runtimes even when the offer prefers frame-v1", async () => {
    installIosWebKitBrowserGlobals();
    installScriptTransformSupport();

    const result = await prepareInboundOfferAcceptance({
      currentIncoming: createIncomingCall({
        mediaEncryptionOffer: {
          preferredMode: "frame-v1",
          supportedModes: ["frame-v1", "transport"],
        },
      }),
      callSecurityMode: "balanced",
      resolveLocalSupportedMediaEncryptionModes: detectLocalDirectCallMediaEncryptionModes,
      finishCallSession: vi.fn(),
      pushNotice: vi.fn(),
      t: (key: string) => key,
      rejectInboundSetup: vi.fn(),
    });

    expect(result).toEqual(expect.objectContaining({
      localSupportedMediaEncryptionModes: ["transport"],
      selectedMediaEncryptionMode: "transport",
    }));
  });
});

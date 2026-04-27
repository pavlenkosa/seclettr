import { describe, expect, it } from "vitest";
import type { ActiveCall, IncomingCall } from "@/calls/direct/model/direct-call-types";
import {
  canDirectCallRuntimeAction,
  mapDirectCallRuntimeStateToSharedPhase,
  resolveDirectCallRuntimeState,
} from "@/calls/direct/model/direct-call-runtime-state";
import {
  canMutateCallMedia,
  canRetryCallLifecycle,
} from "@/calls/shared/model/call-lifecycle-contract";

function createActiveCall(overrides?: Partial<ActiveCall>): ActiveCall {
  return {
    callId: "call-1",
    peerUserId: "peer-1",
    peerDeviceId: "device-1",
    peerLabel: "Peer One",
    callType: "audio",
    direction: "outbound",
    state: "active",
    muted: false,
    videoOff: true,
    screenSharing: false,
    duration: 12,
    signalingVerified: true,
    e2eeActive: true,
    verificationCode: null,
    verificationHash: null,
    verificationError: null,
    mediaEncryptionMode: "transport",
    peerSupportsRenegotiationV1: true,
    ...overrides,
  };
}

function createIncomingCall(): IncomingCall {
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
  };
}

describe("resolveDirectCallRuntimeState", () => {
  it("returns incoming when an incoming offer is present", () => {
    expect(resolveDirectCallRuntimeState({
      active: null,
      incoming: createIncomingCall(),
    })).toBe("incoming");
  });

  it("returns outgoing for an outbound ringing call", () => {
    expect(resolveDirectCallRuntimeState({
      active: createActiveCall({
        state: "ringing",
        direction: "outbound",
      }),
      incoming: null,
    })).toBe("outgoing");
  });

  it("returns active_video when active video is enabled", () => {
    expect(resolveDirectCallRuntimeState({
      active: createActiveCall({
        callType: "video",
        videoOff: false,
      }),
      incoming: null,
    })).toBe("active_video");
  });

  it("returns screen_sharing when display media is active", () => {
    expect(resolveDirectCallRuntimeState({
      active: createActiveCall({
        callType: "video",
        videoOff: false,
        screenSharing: true,
      }),
      incoming: null,
    })).toBe("screen_sharing");
  });

  it("returns reconnecting when transport state drops during an active call", () => {
    expect(resolveDirectCallRuntimeState({
      active: createActiveCall(),
      incoming: null,
      peerConnectionState: "disconnected",
    })).toBe("reconnecting");
  });

  it("returns idle when no session is active", () => {
    expect(resolveDirectCallRuntimeState({
      active: null,
      incoming: null,
    })).toBe("idle");

    expect(resolveDirectCallRuntimeState({
      active: createActiveCall({
        state: "connecting",
      }),
      incoming: null,
    })).toBe("connecting");
  });
});

describe("canDirectCallRuntimeAction", () => {
  it("allows active video calls to start screen share and blocks it during incoming state", () => {
    expect(canDirectCallRuntimeAction("active_video", "toggle_screen_share")).toBe(true);
    expect(canDirectCallRuntimeAction("incoming", "toggle_screen_share")).toBe(false);
  });
});

describe("mapDirectCallRuntimeStateToSharedPhase", () => {
  it("maps direct-specific states onto the shared lifecycle contract", () => {
    expect(mapDirectCallRuntimeStateToSharedPhase("idle")).toBe("idle");
    expect(mapDirectCallRuntimeStateToSharedPhase("incoming")).toBe("inviting");
    expect(mapDirectCallRuntimeStateToSharedPhase("outgoing")).toBe("inviting");
    expect(mapDirectCallRuntimeStateToSharedPhase("connecting")).toBe("joining");
    expect(mapDirectCallRuntimeStateToSharedPhase("active_audio")).toBe("live");
    expect(mapDirectCallRuntimeStateToSharedPhase("active_video")).toBe("live");
    expect(mapDirectCallRuntimeStateToSharedPhase("screen_sharing")).toBe("live");
    expect(mapDirectCallRuntimeStateToSharedPhase("reconnecting")).toBe("reconnecting");
  });

  it("uses shared media mutation and retry semantics", () => {
    expect(canMutateCallMedia(mapDirectCallRuntimeStateToSharedPhase("active_video"))).toBe(true);
    expect(canMutateCallMedia(mapDirectCallRuntimeStateToSharedPhase("reconnecting"))).toBe(false);
    expect(canRetryCallLifecycle(mapDirectCallRuntimeStateToSharedPhase("reconnecting"))).toBe(true);
  });
});

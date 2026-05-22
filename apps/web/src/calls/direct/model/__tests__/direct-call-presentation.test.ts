import { describe, expect, it } from "vitest";
import { buildDirectCallPresentationState } from "@/calls/direct/model/direct-call-presentation";
import type { ActiveCall, IncomingCall } from "@/calls/direct/model/direct-call-types";

function t(key: string, params?: Record<string, string | number | undefined>) {
  if (params?.type) {
    return `${key}:${params.type}`;
  }
  return key;
}

function resolvePeerLabel(userId: string, fallbackLabel?: string) {
  return fallbackLabel ?? userId;
}

describe("buildDirectCallPresentationState", () => {
  it("builds incoming prompt and minimized summary metadata", () => {
    const incoming: IncomingCall = {
      callId: "call-1",
      callerUserId: "user-2",
      callerDeviceId: "device-2",
      callerLabel: "Seclettr Two",
      callType: "video",
      targetUserId: "user-1",
      offerSdp: "offer-sdp",
      mediaEncryptionOffer: {
        preferredMode: "transport",
        supportedModes: ["transport"],
      },
      supportsRenegotiationV1: true,
    };

    const presentation = buildDirectCallPresentationState({
      active: null,
      incoming,
      isMinimized: true,
      isSecurityCardOpen: false,
      t,
      resolvePeerLabel,
    });

    expect(presentation.surface).toBe("incoming-minimized");
    expect(presentation.runtimeState).toBe("incoming");
    expect(presentation.incomingPeerDisplayName).toBe("Seclettr Two");
    expect(presentation.incomingPeerInitials).toBe("ST");
    expect(presentation.incomingPromptText).toBe("call.incomingLabel:call.callType.video");
    expect(presentation.incomingMinimizedMetaText).toBe(
      "call.incomingLabel:call.callType.video / call.state.ringing"
    );
  });

  it("builds active call security and control labels", () => {
    const active: ActiveCall = {
      callId: "call-2",
      peerUserId: "peer-2",
      peerDeviceId: "device-2",
      peerLabel: "Seclettr Peer",
      callType: "video",
      direction: "outbound",
      state: "active",
      muted: true,
      videoOff: true,
      screenSharing: false,
      duration: 61,
      signalingVerified: true,
      e2eeActive: false,
      verificationCode: null,
      verificationHash: null,
      verificationError: null,
      mediaEncryptionMode: "transport",
      peerSupportsRenegotiationV1: true,
    };

    const presentation = buildDirectCallPresentationState({
      active,
      incoming: null,
      isMinimized: false,
      isSecurityCardOpen: true,
      t,
      resolvePeerLabel,
    });

    expect(presentation.surface).toBe("active-fullscreen");
    expect(presentation.runtimeState).toBe("active_audio");
    expect(presentation.peerDisplayName).toBe("Seclettr Peer");
    expect(presentation.peerDisplayInitials).toBe("SP");
    expect(presentation.callSecurityStatusLabel).toBe("callSecurity.pending");
    expect(presentation.callSecurityToggleLabel).toBe("callSecurity.hideCode");
    expect(presentation.activeCallStateText).toBe("1:01");
    expect(presentation.muteToggleLabel).toBe("call.unmute");
    expect(presentation.videoToggleLabel).toBe("call.cameraOnLabel");
    expect(presentation.screenShareToggleLabel).toBe("call.startScreenShare");
  });
});

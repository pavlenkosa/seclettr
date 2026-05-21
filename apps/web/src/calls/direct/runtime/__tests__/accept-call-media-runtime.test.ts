import { describe, expect, it, vi } from "vitest";
import type { IncomingCall } from "@/calls/direct/model/direct-call-types";
import { bootstrapAcceptedIncomingCall } from "@/calls/direct/runtime/setup/accept-call-media-runtime";

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

function createFakeStream(): MediaStream {
  return {
    getTracks: () => [{ stop: vi.fn() }] as unknown as MediaStreamTrack[],
  } as unknown as MediaStream;
}

describe("bootstrapAcceptedIncomingCall", () => {
  it("claims visual senders only after the remote offer is applied", async () => {
    const stepOrder: string[] = [];
    const peerConnection = {
      setRemoteDescription: vi.fn(async () => {
        stepOrder.push("set-remote-description");
      }),
      close: vi.fn(),
    } as unknown as RTCPeerConnection;

    const ensureVideoSenders = vi.fn(() => {
      stepOrder.push("ensure-video-senders");
    });

    await bootstrapAcceptedIncomingCall({
      currentIncoming: createIncomingCall(),
      offerVerificationState: "verified",
      resolvedMediaEncryptionMode: "transport",
      acceptingIncomingCallRef: { current: createIncomingCall() },
      peerConnectionRef: { current: null },
      commitActiveState: vi.fn(),
      setIsMinimized: vi.fn(),
      clearNotice: vi.fn(),
      createPeerConnection: vi.fn(async () => peerConnection),
      ensureVideoSenders,
      requestLocalStream: vi.fn(async () => createFakeStream()),
      attachLocalTracksToPeer: vi.fn(async () => undefined),
      syncVisualTransceiverBindings: vi.fn(),
      syncVisualTransceiverDirections: vi.fn(),
      syncOutgoingVisualMediaStateTrackBindings: vi.fn(),
      refreshRemoteVideoTracksFromPeer: vi.fn(),
      debugCallMedia: vi.fn(),
      ensureCurrentLifecycle: vi.fn(),
    });

    expect(stepOrder).toEqual(["set-remote-description", "ensure-video-senders"]);
  });
});

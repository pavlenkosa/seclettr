import { beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeAcceptedIncomingCallAnswer } from "@/calls/direct/runtime/setup/accept-call-answer-runtime";

const createSignedCallAnswerAuth = vi.hoisted(() => vi.fn());
const wsSend = vi.hoisted(() => vi.fn());

vi.mock("@/calls/direct/runtime/crypto/call-auth-actions", () => ({
  createSignedCallAnswerAuth,
}));

vi.mock("@/lib/websocket", () => ({
  wsClient: {
    send: wsSend,
  },
}));

describe("finalizeAcceptedIncomingCallAnswer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSignedCallAnswerAuth.mockResolvedValue(null);
    wsSend.mockReturnValue({ status: "sent" });
  });

  it("signs the same media-encryption answer payload that it dispatches", async () => {
    const negotiationReadyRef = { current: false };
    const pc = {
      createAnswer: vi.fn(async () => ({ type: "answer", sdp: "answer-sdp" })),
      setLocalDescription: vi.fn(async () => undefined),
      addIceCandidate: vi.fn(async () => undefined),
    } as unknown as RTCPeerConnection;

    await finalizeAcceptedIncomingCallAnswer({
      callId: "call-incoming",
      callerUserId: "peer-2",
      callerDeviceId: "device-2",
      selectedMediaEncryptionMode: "transport",
      resolvedMediaEncryptionMode: "transport",
      localSupportedMediaEncryptionModes: ["transport"],
      mediaEncryptionOfferEphemeralPublicKey: undefined,
      callSecurityMode: "balanced",
      pc,
      pendingIceCandidatesRef: { current: new Map() },
      incomingIceCandidatesRef: { current: new Map() },
      configureDirectCallFrameCrypto: vi.fn(async () => true),
      commitActiveState: vi.fn(),
      pushNotice: vi.fn(),
      t: (key: string) => key,
      setPeerEphemeralPublicKey: vi.fn(),
      prepareLocalEphemeralKey: vi.fn(async () => "mock-ephemeral-pub-key"),
      syncVisualTransceiverBindings: vi.fn(),
      syncOutgoingVisualMediaStateTrackBindings: vi.fn(),
      refreshRemoteVideoTracksFromPeer: vi.fn(),
      debugCallMedia: vi.fn(),
      applyCallSecurityState: vi.fn(async () => undefined),
      negotiationReadyRef,
      ensureCurrentLifecycle: vi.fn(),
    });

    expect(createSignedCallAnswerAuth).toHaveBeenCalledWith({
      callId: "call-incoming",
      recipientUserId: "peer-2",
      sdp: "answer-sdp",
      mediaEncryption: {
        selectedMode: "transport",
        supportedModes: ["transport"],
      },
    });
    expect(wsSend).toHaveBeenCalledWith(expect.objectContaining({
      type: "call.answer",
      callId: "call-incoming",
      sdp: "answer-sdp",
      mediaEncryption: {
        selectedMode: "transport",
        supportedModes: ["transport"],
      },
    }));
    expect(negotiationReadyRef.current).toBe(true);
  });
});

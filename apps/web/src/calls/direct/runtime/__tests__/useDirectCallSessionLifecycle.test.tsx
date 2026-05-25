// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActiveCall,
  IncomingCall,
} from "@/calls/direct/model/direct-call-types";
import { createEmptyRemoteMediaSlot } from "@/calls/direct/model/call-media-slots";
import type { UseDirectCallSessionLifecycleOptions } from "@/calls/direct/runtime/session/direct-call-session-lifecycle-shared";
import { useDirectCallSessionLifecycle } from "@/calls/direct/runtime/useDirectCallSessionLifecycle";

const sessionLifecycleMocks = vi.hoisted(() => ({
  directHangupCall: vi.fn(),
  directRejectCall: vi.fn(),
  stopIncomingRingtone: vi.fn(),
  stopOutgoingRingtone: vi.fn(),
  useDirectCallFrameModeRecovery: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    directHangupCall: sessionLifecycleMocks.directHangupCall,
    directRejectCall: sessionLifecycleMocks.directRejectCall,
  },
}));

vi.mock("@/calls/direct/runtime/session/useDirectCallIncomingRingtone", () => ({
  useDirectCallIncomingRingtone: () => ({
    stopIncomingRingtone: sessionLifecycleMocks.stopIncomingRingtone,
  }),
}));

vi.mock("@/calls/direct/runtime/session/useDirectCallOutgoingRingtone", () => ({
  useDirectCallOutgoingRingtone: () => ({
    stopOutgoingRingtone: sessionLifecycleMocks.stopOutgoingRingtone,
  }),
}));

vi.mock("@/calls/direct/runtime/session/useDirectCallFrameModeRecovery", () => ({
  useDirectCallFrameModeRecovery: sessionLifecycleMocks.useDirectCallFrameModeRecovery,
}));

type SessionLifecycleApi = ReturnType<typeof useDirectCallSessionLifecycle>;

function createActiveCall(overrides?: Partial<ActiveCall>): ActiveCall {
  return {
    callId: "call-1",
    peerUserId: "peer-1",
    peerDeviceId: "device-1",
    peerLabel: "Peer One",
    callType: "video",
    direction: "outbound",
    state: "active",
    muted: false,
    videoOff: false,
    screenSharing: false,
    duration: 42,
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

function createIncomingCall(overrides?: Partial<IncomingCall>): IncomingCall {
  return {
    callId: "call-2",
    callerUserId: "peer-2",
    callerDeviceId: "device-2",
    callerLabel: "Peer Two",
    callType: "audio",
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

function createStateDispatch<T>(
  ref: MutableRefObject<T>,
  sink: MutableRefObject<T>
) {
  return vi.fn((next: T | ((prev: T) => T)) => {
    const value = typeof next === "function"
      ? (next as (prev: T) => T)(sink.current)
      : next;
    sink.current = value;
    ref.current = value;
  });
}

function createFakeTrack(id: string) {
  return {
    id,
    stop: vi.fn(),
    readyState: "live",
  } as unknown as MediaStreamTrack;
}

function createFakeStream(tracks: MediaStreamTrack[] = []) {
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks,
  } as unknown as MediaStream;
}

function HookHarness(props: {
  options: UseDirectCallSessionLifecycleOptions;
  capture: (runtime: SessionLifecycleApi) => void;
}) {
  const runtime = useDirectCallSessionLifecycle(props.options);
  props.capture(runtime);
  return null;
}

function createLifecycleContext() {
  const activeState = {
    current: createActiveCall(),
  } as MutableRefObject<ActiveCall | null>;
  const incomingState = {
    current: null as IncomingCall | null,
  } as MutableRefObject<IncomingCall | null>;
  const acceptingState = {
    current: null as IncomingCall | null,
  } as MutableRefObject<IncomingCall | null>;
  const minimizedState = { current: true } as MutableRefObject<boolean>;
  const localTrack = createFakeTrack("local-audio");
  const screenTrack = createFakeTrack("screen-track");
  const localStream = createFakeStream([localTrack]);
  const remoteAudioStream = createFakeStream();
  const remoteCameraStream = createFakeStream();
  const remoteScreenStream = createFakeStream();
  const localVideo = document.createElement("video");
  const localScreenPreview = document.createElement("video");
  const remoteVideo = document.createElement("video");
  const remoteScreenVideo = document.createElement("video");
  const remoteCameraProbe = document.createElement("video");
  const remoteScreenProbe = document.createElement("video");
  const remoteAudio = document.createElement("audio");
  localVideo.srcObject = localStream;
  localScreenPreview.srcObject = createFakeStream();
  remoteVideo.srcObject = remoteCameraStream;
  remoteScreenVideo.srcObject = remoteScreenStream;
  remoteCameraProbe.srcObject = remoteCameraStream;
  remoteScreenProbe.srcObject = remoteScreenStream;
  remoteAudio.srcObject = remoteAudioStream;
  const peerConnection = {
    close: vi.fn(),
    onicecandidate: vi.fn(),
    ontrack: vi.fn(),
    onconnectionstatechange: vi.fn(),
    oniceconnectionstatechange: vi.fn(),
    onsignalingstatechange: vi.fn(),
    onicegatheringstatechange: vi.fn(),
    onnegotiationneeded: vi.fn(),
  } as unknown as RTCPeerConnection;
  const pushNotice = vi.fn();
  const resetRemoteMediaRuntime = vi.fn();
  const closeDirectCallFrameCrypto = vi.fn();
  const resetMinimizedDockState = vi.fn();
  const resetLocalPreviewState = vi.fn();
  const resetLocalScreenPreviewState = vi.fn();
  const clearOutgoingMediaStateTrackBindings = vi.fn();
  const setIncoming = createStateDispatch(incomingState, incomingState);
  const setActive = createStateDispatch(activeState, activeState);
  const setIsMinimized = createStateDispatch(minimizedState, minimizedState);
  const disconnectTimer = globalThis.window.setTimeout(() => undefined, 60_000);
  const frameRecoveryTimer = globalThis.window.setTimeout(() => undefined, 60_000);

  const options: UseDirectCallSessionLifecycleOptions = {
    active: activeState.current,
    incomingCallId: null,
    callSecurityMode: "balanced",
    remoteVideoReady: false,
    remoteScreenReady: false,
    remoteCameraSlot: createEmptyRemoteMediaSlot("camera"),
    remoteScreenSlot: createEmptyRemoteMediaSlot("screen"),
    remoteCameraStreamRef: { current: remoteCameraStream },
    remoteScreenStreamRef: { current: remoteScreenStream },
    incomingRef: incomingState,
    acceptingIncomingCallRef: acceptingState,
    activeRef: activeState,
    localVideoRef: { current: localVideo },
    localScreenPreviewRef: { current: localScreenPreview },
    remoteVideoRef: { current: remoteVideo },
    remoteScreenVideoRef: { current: remoteScreenVideo },
    remoteCameraProbeRef: { current: remoteCameraProbe },
    remoteScreenProbeRef: { current: remoteScreenProbe },
    remoteAudioRef: { current: remoteAudio },
    remoteCameraPlaybackRef: { current: { lastTime: 1, lastFrameCount: 1, lastProgressAt: 1 } },
    remoteScreenPlaybackRef: { current: { lastTime: 2, lastFrameCount: 2, lastProgressAt: 2 } },
    remoteInboundVideoProgressRef: { current: new Map([["track-1", { lastFrameAt: 1, lastPacketAt: 1 }]]) as Map<string, any> },
    callMediaStateSeqRef: { current: 7 },
    localMediaStateRevisionRef: { current: { camera: 2, screen: 3, mic: 4 } },
    remoteMediaStateSeqRef: { current: { camera: 5, screen: 6, mic: 7 } },
    remoteMediaStateRevisionRef: { current: { camera: 8, screen: 9, mic: 10 } },
    lastIncomingMediaStateRef: { current: { camera: { seq: 1, streamRevision: 1, state: "on", activity: "active", reason: null, mid: "0" }, screen: null, mic: null } },
    setIncoming,
    setActive,
    setIsMinimized,
    peerConnectionRef: { current: peerConnection },
    localStreamRef: { current: localStream },
    cameraSenderRef: { current: {} as RTCRtpSender },
    cameraTransceiverRef: { current: {} as RTCRtpTransceiver },
    screenShareTrackRef: { current: screenTrack },
    screenShareSenderRef: { current: {} as RTCRtpSender },
    screenShareTransceiverRef: { current: {} as RTCRtpTransceiver },
    localScreenPreviewStreamRef: { current: createFakeStream() },
    remoteAudioStreamRef: { current: remoteAudioStream },
    outgoingIceBatchReset: vi.fn(),
    resetRemoteMediaRuntime,
    closeDirectCallFrameCrypto,
    resetMinimizedDockState,
    resetLocalPreviewState,
    resetLocalScreenPreviewState,
    configureDirectCallFrameCrypto: vi.fn(async () => true),
    pushNotice,
    t: (key: string) => key,
    outboundMediaEncryptionOfferRef: {
      current: {
        preferredMode: "transport",
        supportedModes: ["transport"],
      },
    },
    pendingIceCandidatesRef: {
      current: new Map([["call-1", [{ candidate: "candidate:active", sdpMid: "0" }]]]),
    },
    incomingIceCandidatesRef: {
      current: new Map([["call-1", [{ candidate: "candidate:incoming", sdpMid: "1" }]]]),
    },
    frameModeRecoveryTimerRef: { current: frameRecoveryTimer },
    frameModeRecoveryAttemptedCallIdRef: { current: "call-1" },
    incomingRingtoneRef: { current: null },
    outgoingRingtoneRef: { current: null },
    directCallLifecycleTokenRef: { current: 3 },
    directCallNegotiationRoleRef: { current: "impolite" },
    supportsPeerRenegotiationV1Ref: { current: true },
    renegotiationUnsupportedRef: { current: true },
    negotiationReadyRef: { current: true },
    makingOfferRef: { current: true },
    ignoreOfferRef: { current: true },
    isSettingRemoteAnswerPendingRef: { current: true },
    renegotiationRevisionRef: { current: 11 },
    lastAppliedRemoteRenegotiationRevisionRef: { current: 12 },
    pendingLocalRenegotiationRevisionRef: { current: 13 },
    pendingRenegotiationReasonRef: { current: "screen-on" },
    lastRenegotiationAttemptRef: { current: { revision: 13, stage: "sent" } },
    lastSignalingErrorRef: { current: { code: "ERR" } },
    disconnectResetTimerRef: { current: disconnectTimer },
    disconnectRecoveryAttemptedRef: { current: true },
    clearOutgoingMediaStateTrackBindingsRef: { current: clearOutgoingMediaStateTrackBindings },
    isCurrentActiveCallContext: (callId) => activeState.current?.callId === callId,
  };

  return {
    activeState,
    incomingState,
    acceptingState,
    minimizedState,
    localTrack,
    screenTrack,
    localVideo,
    localScreenPreview,
    remoteVideo,
    remoteScreenVideo,
    remoteCameraProbe,
    remoteScreenProbe,
    remoteAudio,
    peerConnection,
    pushNotice,
    resetRemoteMediaRuntime,
    closeDirectCallFrameCrypto,
    resetMinimizedDockState,
    resetLocalPreviewState,
    resetLocalScreenPreviewState,
    clearOutgoingMediaStateTrackBindings,
    options,
  };
}

describe("useDirectCallSessionLifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;
  let runtime: SessionLifecycleApi | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    runtime = null;
    vi.clearAllMocks();
    sessionLifecycleMocks.directHangupCall.mockResolvedValue(undefined);
    sessionLifecycleMocks.directRejectCall.mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("clears session resources on teardown and resolves the next session against fresh refs", async () => {
    const context = createLifecycleContext();

    act(() => {
      root.render(
        <HookHarness
          options={context.options}
          capture={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      );
    });

    if (!runtime) {
      throw new Error("Expected session lifecycle runtime");
    }

    await act(async () => {
      runtime?.finishCallSession({
        reason: "local-hangup",
        authority: "hangup",
        callId: "call-1",
        notice: { kind: "info", message: "call.notice.ended" },
      });
      await Promise.resolve();
    });

    expect(sessionLifecycleMocks.directHangupCall).toHaveBeenCalledWith("call-1");
    expect(sessionLifecycleMocks.stopOutgoingRingtone).toHaveBeenCalled();
    expect(context.activeState.current).toBeNull();
    expect(context.incomingState.current).toBeNull();
    expect(context.acceptingState.current).toBeNull();
    expect(context.minimizedState.current).toBe(false);
    expect(context.options.peerConnectionRef.current).toBeNull();
    expect(context.options.pendingIceCandidatesRef.current.size).toBe(0);
    expect(context.options.incomingIceCandidatesRef.current.size).toBe(0);
    expect(context.options.outboundMediaEncryptionOfferRef.current).toBeNull();
    expect(context.options.negotiationReadyRef.current).toBe(false);
    expect(context.options.makingOfferRef.current).toBe(false);
    expect(context.options.ignoreOfferRef.current).toBe(false);
    expect(context.options.pendingRenegotiationReasonRef.current).toBeNull();
    expect(context.options.disconnectResetTimerRef.current).toBeNull();
    expect(context.options.frameModeRecoveryTimerRef.current).toBeNull();
    expect(context.options.directCallLifecycleTokenRef.current).toBe(4);
    expect(context.localTrack.stop).toHaveBeenCalledTimes(1);
    expect(context.screenTrack.stop).toHaveBeenCalledTimes(1);
    expect(context.peerConnection.close).toHaveBeenCalledTimes(1);
    expect(context.localVideo.srcObject).toBeNull();
    expect(context.localScreenPreview.srcObject).toBeNull();
    expect(context.remoteVideo.srcObject).toBeNull();
    expect(context.remoteScreenVideo.srcObject).toBeNull();
    expect(context.remoteCameraProbe.srcObject).toBeNull();
    expect(context.remoteScreenProbe.srcObject).toBeNull();
    expect(context.remoteAudio.srcObject).toBeNull();
    expect(context.pushNotice).toHaveBeenNthCalledWith(1, {
      kind: "info",
      message: "call.notice.ended",
    });

    const secondIncoming = createIncomingCall();
    context.incomingState.current = secondIncoming;
    context.options.incomingRef.current = secondIncoming;
    context.options.pendingIceCandidatesRef.current = new Map([["call-2", [{ candidate: "candidate:second", sdpMid: "2" }]]]);
    context.options.incomingIceCandidatesRef.current.set("call-2", [{ candidate: "candidate:second-incoming", sdpMid: "3" }]);

    await act(async () => {
      runtime?.finishCallSession({
        reason: "local-reject",
        authority: "reject",
        notice: { kind: "info", message: "call.notice.declined" },
      });
      await Promise.resolve();
    });

    expect(sessionLifecycleMocks.directRejectCall).toHaveBeenCalledWith("call-2");
    expect(context.incomingState.current).toBeNull();
    expect(context.options.incomingRef.current).toBeNull();
    expect(context.options.pendingIceCandidatesRef.current.size).toBe(0);
    expect(context.options.incomingIceCandidatesRef.current.size).toBe(0);
    expect(context.options.directCallLifecycleTokenRef.current).toBe(5);
    expect(context.pushNotice).toHaveBeenNthCalledWith(2, {
      kind: "info",
      message: "call.notice.declined",
    });
    expect(context.resetRemoteMediaRuntime).toHaveBeenCalledTimes(2);
    expect(context.closeDirectCallFrameCrypto).toHaveBeenCalledTimes(2);
    expect(context.resetMinimizedDockState).toHaveBeenCalledTimes(2);
    expect(context.resetLocalPreviewState).toHaveBeenCalledTimes(2);
    expect(context.resetLocalScreenPreviewState).toHaveBeenCalledTimes(2);
    expect(context.clearOutgoingMediaStateTrackBindings).toHaveBeenCalledTimes(2);
    expect(sessionLifecycleMocks.stopIncomingRingtone).toHaveBeenCalledTimes(2);
  });
});

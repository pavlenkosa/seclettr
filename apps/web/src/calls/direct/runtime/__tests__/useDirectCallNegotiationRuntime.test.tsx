// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActiveCall,
  CallNotice,
  IncomingCallAnsweredSignal,
} from "@/calls/direct/model/direct-call-types";
import { useDirectCallNegotiationRuntime } from "@/calls/direct/runtime/useDirectCallNegotiationRuntime";

const negotiationMocks = vi.hoisted(() => {
  const verifyIncomingCallAnswer = vi.fn();
  const verifyIncomingCallRenegotiationAnswer = vi.fn();
  const verifyIncomingCallRenegotiationOffer = vi.fn();
  const createSignedCallRenegotiationAnswerAuth = vi.fn();
  const createSignedCallRenegotiationOfferAuth = vi.fn();
  const wsSend = vi.fn();
  const connectionListeners = new Set<(connected: boolean) => void>();
  const onConnectionChange = vi.fn((listener: (connected: boolean) => void) => {
    connectionListeners.add(listener);
    return () => {
      connectionListeners.delete(listener);
    };
  });
  return {
    verifyIncomingCallAnswer,
    verifyIncomingCallRenegotiationAnswer,
    verifyIncomingCallRenegotiationOffer,
    createSignedCallRenegotiationAnswerAuth,
    createSignedCallRenegotiationOfferAuth,
    wsSend,
    onConnectionChange,
    emitConnectionChange: (connected: boolean) => {
      for (const listener of connectionListeners) {
        listener(connected);
      }
    },
    resetConnectionListeners: () => {
      connectionListeners.clear();
    },
  };
});

vi.mock("@/stores/auth", () => ({
  useAuthStore: {
    getState: () => ({
      userId: "local-user",
      deviceId: "local-device",
    }),
  },
}));

vi.mock("@/calls/direct/runtime/crypto/call-auth-actions", () => ({
  verifyIncomingCallAnswer: negotiationMocks.verifyIncomingCallAnswer,
  verifyIncomingCallRenegotiationAnswer: negotiationMocks.verifyIncomingCallRenegotiationAnswer,
  verifyIncomingCallRenegotiationOffer: negotiationMocks.verifyIncomingCallRenegotiationOffer,
  createSignedCallRenegotiationAnswerAuth: negotiationMocks.createSignedCallRenegotiationAnswerAuth,
  createSignedCallRenegotiationOfferAuth: negotiationMocks.createSignedCallRenegotiationOfferAuth,
}));

vi.mock("@/lib/websocket", () => ({
  wsClient: {
    send: negotiationMocks.wsSend,
    onConnectionChange: negotiationMocks.onConnectionChange,
  },
}));

type NegotiationRuntimeApi = ReturnType<typeof useDirectCallNegotiationRuntime>;

function createActiveCall(overrides?: Partial<ActiveCall>): ActiveCall {
  return {
    callId: "call-1",
    peerUserId: "peer-1",
    peerDeviceId: "device-1",
    peerLabel: "Peer One",
    callType: "video",
    direction: "outbound",
    state: "ringing",
    muted: false,
    videoOff: false,
    screenSharing: false,
    duration: 0,
    signalingVerified: true,
    e2eeActive: true,
    verificationCode: null,
    verificationHash: null,
    verificationError: null,
    mediaEncryptionMode: "frame-v1",
    peerSupportsRenegotiationV1: false,
    ...overrides,
  };
}

function createAnswerSignal(overrides?: Partial<IncomingCallAnsweredSignal>): IncomingCallAnsweredSignal {
  return {
    type: "call.answered",
    callId: "call-1",
    answererUserId: "peer-1",
    answererDeviceId: "device-1",
    targetUserId: "local-user",
    sdp: "v=0\r\ns=-",
    mediaEncryption: {
      selectedMode: "frame-v1",
      supportedModes: ["frame-v1", "transport"],
    },
    features: {
      renegotiationV1: true,
    },
    auth: undefined,
    ...overrides,
  };
}

function HookHarness(props: {
  activeRef: MutableRefObject<ActiveCall | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  supportsPeerRenegotiationV1Ref: MutableRefObject<boolean>;
  renegotiationUnsupportedRef: MutableRefObject<boolean>;
  pendingRenegotiationReasonRef: MutableRefObject<string | null>;
  makingOfferRef: MutableRefObject<boolean>;
  ignoreOfferRef: MutableRefObject<boolean>;
  isSettingRemoteAnswerPendingRef: MutableRefObject<boolean>;
  renegotiationRevisionRef: MutableRefObject<number>;
  lastAppliedRemoteRenegotiationRevisionRef: MutableRefObject<number>;
  pendingLocalRenegotiationRevisionRef: MutableRefObject<number | null>;
  directCallNegotiationRoleRef: MutableRefObject<"polite" | "impolite">;
  negotiationReadyRef: MutableRefObject<boolean>;
  lastRenegotiationAttemptRef: MutableRefObject<Record<string, unknown> | null>;
  lastSignalingErrorRef: MutableRefObject<Record<string, unknown> | null>;
  outboundMediaEncryptionOfferRef: MutableRefObject<{
    preferredMode: "transport" | "frame-v1";
    supportedModes: ("transport" | "frame-v1")[];
  } | null>;
  pendingIceCandidatesRef: MutableRefObject<RTCIceCandidateInit[]>;
  setActive: (next: ActiveCall | null | ((prev: ActiveCall | null) => ActiveCall | null)) => void;
  callSecurityMode: "compatibility" | "balanced" | "strict";
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  recordLastRenegotiationAttempt: (payload: Record<string, unknown>) => void;
  shouldIgnoreUnexpectedPeerSignal: (params: {
    callId: string;
    signalType: string;
    senderUserId?: string | null;
    senderDeviceId?: string | null;
    revision?: number;
    source?: string;
  }) => boolean;
  isCurrentActiveCallContext: (callId: string, pc?: RTCPeerConnection | null) => boolean;
  resetCallState: (opts?: { sendHangup?: boolean; notice?: CallNotice }) => void;
  resetCallStateIfCurrent: (
    callId: string,
    opts?: { sendHangup?: boolean; notice?: CallNotice },
    pc?: RTCPeerConnection | null
  ) => boolean;
  syncVisualTransceiverBindings: () => void;
  syncVisualTransceiverDirections: (callId: string) => void;
  syncOutgoingVisualMediaStateTrackBindings: (callIdOverride?: string) => void;
  refreshRemoteVideoTracksFromPeer?: (callIdOverride?: string, reason?: string) => void;
  configureDirectCallFrameCrypto: (params: {
    callId: string;
    mediaEncryptionMode: "transport" | "frame-v1";
    peerUserId: string;
    peerDeviceId: string | null;
  }) => Promise<boolean>;
  applySignalVerificationResult: (callId: string, result: { state: string }) => void;
  applyCallSecurityState: (callId: string, pc: RTCPeerConnection) => Promise<void>;
  setActiveIfCurrent: (callId: string, update: (current: ActiveCall) => ActiveCall) => void;
  pushNotice: (next: CallNotice, timeoutMs?: number) => void;
  capture: (runtime: NegotiationRuntimeApi) => void;
}) {
  const runtime = useDirectCallNegotiationRuntime({
    activeRef: props.activeRef,
    peerConnectionRef: props.peerConnectionRef,
    supportsPeerRenegotiationV1Ref: props.supportsPeerRenegotiationV1Ref,
    renegotiationUnsupportedRef: props.renegotiationUnsupportedRef,
    pendingRenegotiationReasonRef: props.pendingRenegotiationReasonRef,
    makingOfferRef: props.makingOfferRef,
    ignoreOfferRef: props.ignoreOfferRef,
    isSettingRemoteAnswerPendingRef: props.isSettingRemoteAnswerPendingRef,
    renegotiationRevisionRef: props.renegotiationRevisionRef,
    lastAppliedRemoteRenegotiationRevisionRef: props.lastAppliedRemoteRenegotiationRevisionRef,
    pendingLocalRenegotiationRevisionRef: props.pendingLocalRenegotiationRevisionRef,
    directCallNegotiationRoleRef: props.directCallNegotiationRoleRef,
    negotiationReadyRef: props.negotiationReadyRef,
    lastRenegotiationAttemptRef: props.lastRenegotiationAttemptRef,
    lastSignalingErrorRef: props.lastSignalingErrorRef,
    outboundMediaEncryptionOfferRef: props.outboundMediaEncryptionOfferRef,
    pendingIceCandidatesRef: props.pendingIceCandidatesRef,
    setActive: props.setActive,
    callSecurityMode: props.callSecurityMode,
    debugCallMedia: props.debugCallMedia,
    recordLastRenegotiationAttempt: props.recordLastRenegotiationAttempt,
    shouldIgnoreUnexpectedPeerSignal: props.shouldIgnoreUnexpectedPeerSignal,
    isCurrentActiveCallContext: props.isCurrentActiveCallContext,
    resetCallState: props.resetCallState,
    resetCallStateIfCurrent: props.resetCallStateIfCurrent,
    syncVisualTransceiverBindings: props.syncVisualTransceiverBindings,
    syncVisualTransceiverDirections: props.syncVisualTransceiverDirections,
    syncOutgoingVisualMediaStateTrackBindings: props.syncOutgoingVisualMediaStateTrackBindings,
    refreshRemoteVideoTracksFromPeer: props.refreshRemoteVideoTracksFromPeer ?? (() => undefined),
    configureDirectCallFrameCrypto: props.configureDirectCallFrameCrypto,
    setPeerEphemeralPublicKey: () => undefined,
    applySignalVerificationResult: props.applySignalVerificationResult,
    applyCallSecurityState: props.applyCallSecurityState,
    setActiveIfCurrent: props.setActiveIfCurrent,
    pushNotice: props.pushNotice,
    t: (key: string) => key,
  });

  props.capture(runtime);
  return null;
}

describe("useDirectCallNegotiationRuntime handleRemoteAnswer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
    negotiationMocks.resetConnectionListeners();
    negotiationMocks.wsSend.mockReturnValue({ status: "sent" });

    negotiationMocks.verifyIncomingCallAnswer.mockResolvedValue({ state: "verified" });
    negotiationMocks.verifyIncomingCallRenegotiationAnswer.mockResolvedValue({ state: "verified" });
    negotiationMocks.verifyIncomingCallRenegotiationOffer.mockResolvedValue({ state: "verified" });
    negotiationMocks.createSignedCallRenegotiationAnswerAuth.mockResolvedValue(null);
    negotiationMocks.createSignedCallRenegotiationOfferAuth.mockResolvedValue(null);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("ignores a duplicate initial answer after the remote answer is already applied", async () => {
    const activeState = {
      current: createActiveCall({
        state: "connecting",
      }),
    };
    const peerConnection = {
      get remoteDescription() {
        return { type: "answer", sdp: "existing-answer" } as RTCSessionDescription;
      },
      setRemoteDescription: vi.fn(async () => undefined),
      addIceCandidate: vi.fn(async () => undefined),
    } as unknown as RTCPeerConnection;
    const runtimeRef = { current: null as NegotiationRuntimeApi | null };
    const debugCallMedia = vi.fn();
    const resetCallState = vi.fn();
    const resetCallStateIfCurrent = vi.fn(() => true);

    await act(async () => {
      root.render(
        <HookHarness
          activeRef={activeState as MutableRefObject<ActiveCall | null>}
          peerConnectionRef={{ current: peerConnection }}
          supportsPeerRenegotiationV1Ref={{ current: false }}
          renegotiationUnsupportedRef={{ current: false }}
          pendingRenegotiationReasonRef={{ current: null }}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={{ current: null }}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          negotiationReadyRef={{ current: true }}
          lastRenegotiationAttemptRef={{ current: null }}
          lastSignalingErrorRef={{ current: null }}
          outboundMediaEncryptionOfferRef={{
            current: {
              preferredMode: "frame-v1",
              supportedModes: ["frame-v1", "transport"],
            },
          }}
          pendingIceCandidatesRef={{ current: [] }}
          setActive={vi.fn()}
          callSecurityMode="balanced"
          debugCallMedia={debugCallMedia}
          recordLastRenegotiationAttempt={vi.fn()}
          shouldIgnoreUnexpectedPeerSignal={vi.fn(() => false)}
          isCurrentActiveCallContext={vi.fn(() => true)}
          resetCallState={resetCallState}
          resetCallStateIfCurrent={resetCallStateIfCurrent}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          syncOutgoingVisualMediaStateTrackBindings={vi.fn()}
          configureDirectCallFrameCrypto={vi.fn(async () => true)}
          applySignalVerificationResult={vi.fn()}
          applyCallSecurityState={vi.fn(async () => undefined)}
          setActiveIfCurrent={vi.fn()}
          pushNotice={vi.fn()}
          capture={(runtime) => {
            runtimeRef.current = runtime;
          }}
        />
      );
    });

    await act(async () => {
      await runtimeRef.current!.handleRemoteAnswer(createAnswerSignal());
    });

    expect(peerConnection.setRemoteDescription).not.toHaveBeenCalled();
    expect(resetCallState).not.toHaveBeenCalled();
    expect(resetCallStateIfCurrent).not.toHaveBeenCalled();
    expect(negotiationMocks.verifyIncomingCallAnswer).not.toHaveBeenCalled();
    expect(debugCallMedia).toHaveBeenCalledWith("initial-answer-ignored-duplicate", {
      callId: "call-1",
      answererUserId: "peer-1",
      answererDeviceId: "device-1",
    });
  });

  it("accepts a transport initial answer when the callee downgraded from frame mode for compatibility", async () => {
    const activeState = {
      current: createActiveCall({
        state: "connecting",
      }),
    };
    let remoteDescription: RTCSessionDescriptionInit | null = null;
    const peerConnection = {
      get remoteDescription() {
        return remoteDescription as RTCSessionDescription | null;
      },
      setRemoteDescription: vi.fn(async (description: RTCSessionDescriptionInit) => {
        remoteDescription = description;
      }),
      addIceCandidate: vi.fn(async () => undefined),
      connectionState: "connecting",
      iceConnectionState: "checking",
    } as unknown as RTCPeerConnection;
    const runtimeRef = { current: null as NegotiationRuntimeApi | null };
    const configureDirectCallFrameCrypto = vi.fn(async () => true);
    const applyCallSecurityState = vi.fn(async () => undefined);
    const pushNotice = vi.fn();
    const resetCallState = vi.fn();
    const resetCallStateIfCurrent = vi.fn(() => true);
    const setActiveIfCurrent = vi.fn((callId: string, update: (current: ActiveCall) => ActiveCall) => {
      if (activeState.current?.callId !== callId) return;
      activeState.current = update(activeState.current);
    });

    await act(async () => {
      root.render(
        <HookHarness
          activeRef={activeState as MutableRefObject<ActiveCall | null>}
          peerConnectionRef={{ current: peerConnection }}
          supportsPeerRenegotiationV1Ref={{ current: false }}
          renegotiationUnsupportedRef={{ current: false }}
          pendingRenegotiationReasonRef={{ current: null }}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={{ current: null }}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          negotiationReadyRef={{ current: false }}
          lastRenegotiationAttemptRef={{ current: null }}
          lastSignalingErrorRef={{ current: null }}
          outboundMediaEncryptionOfferRef={{
            current: {
              preferredMode: "frame-v1",
              supportedModes: ["frame-v1", "transport"],
            },
          }}
          pendingIceCandidatesRef={{ current: [] }}
          setActive={vi.fn()}
          callSecurityMode="balanced"
          debugCallMedia={vi.fn()}
          recordLastRenegotiationAttempt={vi.fn()}
          shouldIgnoreUnexpectedPeerSignal={vi.fn(() => false)}
          isCurrentActiveCallContext={vi.fn(() => true)}
          resetCallState={resetCallState}
          resetCallStateIfCurrent={resetCallStateIfCurrent}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          syncOutgoingVisualMediaStateTrackBindings={vi.fn()}
          configureDirectCallFrameCrypto={configureDirectCallFrameCrypto}
          applySignalVerificationResult={vi.fn()}
          applyCallSecurityState={applyCallSecurityState}
          setActiveIfCurrent={setActiveIfCurrent}
          pushNotice={pushNotice}
          capture={(runtime) => {
            runtimeRef.current = runtime;
          }}
        />
      );
    });

    await act(async () => {
      await runtimeRef.current!.handleRemoteAnswer(createAnswerSignal({
        mediaEncryption: {
          selectedMode: "transport",
          supportedModes: ["frame-v1", "transport"],
        },
      }));
    });

    expect(peerConnection.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "v=0\r\ns=-",
    });
    expect(configureDirectCallFrameCrypto).toHaveBeenCalledWith({
      callId: "call-1",
      mediaEncryptionMode: "transport",
      peerUserId: "peer-1",
      peerDeviceId: "device-1",
    });
    expect(resetCallState).not.toHaveBeenCalled();
    expect(resetCallStateIfCurrent).not.toHaveBeenCalled();
    expect(pushNotice).not.toHaveBeenCalled();
    expect(applyCallSecurityState).toHaveBeenCalledTimes(1);
    expect(activeState.current?.mediaEncryptionMode).toBe("transport");
    expect(activeState.current?.peerSupportsRenegotiationV1).toBe(true);
  });

  it("falls back from frame-v1 to transport in balanced mode when frame configure fails", async () => {
    const activeState = {
      current: createActiveCall(),
    };
    let remoteDescription: RTCSessionDescriptionInit | null = null;
    const peerConnection = {
      get remoteDescription() {
        return remoteDescription as RTCSessionDescription | null;
      },
      setRemoteDescription: vi.fn(async (description: RTCSessionDescriptionInit) => {
        remoteDescription = description;
      }),
      addIceCandidate: vi.fn(async () => undefined),
    } as unknown as RTCPeerConnection;
    const runtimeRef = { current: null as NegotiationRuntimeApi | null };
    const configureDirectCallFrameCrypto = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const applyCallSecurityState = vi.fn(async () => undefined);
    const applySignalVerificationResult = vi.fn();
    const pushNotice = vi.fn();
    const resetCallState = vi.fn();
    const resetCallStateIfCurrent = vi.fn(() => true);
    const setActive = vi.fn();
    const setActiveIfCurrent = vi.fn((callId: string, update: (current: ActiveCall) => ActiveCall) => {
      if (activeState.current?.callId !== callId) return;
      activeState.current = update(activeState.current);
    });

    await act(async () => {
      root.render(
        <HookHarness
          activeRef={activeState as MutableRefObject<ActiveCall | null>}
          peerConnectionRef={{ current: peerConnection }}
          supportsPeerRenegotiationV1Ref={{ current: false }}
          renegotiationUnsupportedRef={{ current: false }}
          pendingRenegotiationReasonRef={{ current: null }}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={{ current: null }}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          negotiationReadyRef={{ current: false }}
          lastRenegotiationAttemptRef={{ current: null }}
          lastSignalingErrorRef={{ current: null }}
          outboundMediaEncryptionOfferRef={{
            current: {
              preferredMode: "frame-v1",
            supportedModes: ["frame-v1", "transport"],
          },
          }}
          pendingIceCandidatesRef={{ current: [] }}
          setActive={setActive}
          callSecurityMode="balanced"
          debugCallMedia={vi.fn()}
          recordLastRenegotiationAttempt={vi.fn()}
          shouldIgnoreUnexpectedPeerSignal={vi.fn(() => false)}
          isCurrentActiveCallContext={vi.fn(() => true)}
          resetCallState={resetCallState}
          resetCallStateIfCurrent={resetCallStateIfCurrent}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          syncOutgoingVisualMediaStateTrackBindings={vi.fn()}
          configureDirectCallFrameCrypto={configureDirectCallFrameCrypto}
          applySignalVerificationResult={applySignalVerificationResult}
          applyCallSecurityState={applyCallSecurityState}
          setActiveIfCurrent={setActiveIfCurrent}
          pushNotice={pushNotice}
          capture={(runtime) => {
            runtimeRef.current = runtime;
          }}
        />
      );
    });

    await act(async () => {
      await runtimeRef.current!.handleRemoteAnswer(createAnswerSignal());
    });

    expect(configureDirectCallFrameCrypto).toHaveBeenNthCalledWith(1, {
      callId: "call-1",
      mediaEncryptionMode: "frame-v1",
      peerUserId: "peer-1",
      peerDeviceId: "device-1",
    });
    expect(configureDirectCallFrameCrypto).toHaveBeenNthCalledWith(2, {
      callId: "call-1",
      mediaEncryptionMode: "transport",
      peerUserId: "peer-1",
      peerDeviceId: "device-1",
    });
    expect(pushNotice).toHaveBeenCalledWith({
      kind: "info",
      message: "callSecurity.frameFallbackTransport",
    });
    expect(resetCallStateIfCurrent).not.toHaveBeenCalled();
    expect(resetCallState).not.toHaveBeenCalled();
    expect(applyCallSecurityState).toHaveBeenCalledTimes(1);
    expect(applySignalVerificationResult).toHaveBeenCalledWith("call-1", { state: "verified" });
    expect(activeState.current?.mediaEncryptionMode).toBe("transport");
    expect(activeState.current?.state).toBe("connecting");
    expect(activeState.current?.peerSupportsRenegotiationV1).toBe(true);
  });

  it("fails closed in strict mode when frame-v1 configure fails", async () => {
    const activeState = {
      current: createActiveCall(),
    };
    let remoteDescription: RTCSessionDescriptionInit | null = null;
    const peerConnection = {
      get remoteDescription() {
        return remoteDescription as RTCSessionDescription | null;
      },
      setRemoteDescription: vi.fn(async (description: RTCSessionDescriptionInit) => {
        remoteDescription = description;
      }),
      addIceCandidate: vi.fn(async () => undefined),
    } as unknown as RTCPeerConnection;
    const runtimeRef = { current: null as NegotiationRuntimeApi | null };
    const configureDirectCallFrameCrypto = vi.fn()
      .mockResolvedValueOnce(false);
    const applyCallSecurityState = vi.fn(async () => undefined);
    const applySignalVerificationResult = vi.fn();
    const pushNotice = vi.fn();
    const resetCallState = vi.fn();
    const resetCallStateIfCurrent = vi.fn(() => true);
    const setActive = vi.fn();
    const setActiveIfCurrent = vi.fn((callId: string, update: (current: ActiveCall) => ActiveCall) => {
      if (activeState.current?.callId !== callId) return;
      activeState.current = update(activeState.current);
    });

    await act(async () => {
      root.render(
        <HookHarness
          activeRef={activeState as MutableRefObject<ActiveCall | null>}
          peerConnectionRef={{ current: peerConnection }}
          supportsPeerRenegotiationV1Ref={{ current: false }}
          renegotiationUnsupportedRef={{ current: false }}
          pendingRenegotiationReasonRef={{ current: null }}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={{ current: null }}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          negotiationReadyRef={{ current: false }}
          lastRenegotiationAttemptRef={{ current: null }}
          lastSignalingErrorRef={{ current: null }}
          outboundMediaEncryptionOfferRef={{
            current: {
              preferredMode: "frame-v1",
              supportedModes: ["frame-v1", "transport"],
            },
          }}
          pendingIceCandidatesRef={{ current: [] }}
          setActive={setActive}
          callSecurityMode="strict"
          debugCallMedia={vi.fn()}
          recordLastRenegotiationAttempt={vi.fn()}
          shouldIgnoreUnexpectedPeerSignal={vi.fn(() => false)}
          isCurrentActiveCallContext={vi.fn(() => true)}
          resetCallState={resetCallState}
          resetCallStateIfCurrent={resetCallStateIfCurrent}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          syncOutgoingVisualMediaStateTrackBindings={vi.fn()}
          configureDirectCallFrameCrypto={configureDirectCallFrameCrypto}
          applySignalVerificationResult={applySignalVerificationResult}
          applyCallSecurityState={applyCallSecurityState}
          setActiveIfCurrent={setActiveIfCurrent}
          pushNotice={pushNotice}
          capture={(runtime) => {
            runtimeRef.current = runtime;
          }}
        />
      );
    });

    await act(async () => {
      await runtimeRef.current!.handleRemoteAnswer(createAnswerSignal());
    });

    expect(configureDirectCallFrameCrypto).toHaveBeenCalledTimes(1);
    expect(configureDirectCallFrameCrypto).toHaveBeenCalledWith({
      callId: "call-1",
      mediaEncryptionMode: "frame-v1",
      peerUserId: "peer-1",
      peerDeviceId: "device-1",
    });
    expect(resetCallStateIfCurrent).toHaveBeenCalledWith("call-1", {
      sendHangup: true,
      notice: { kind: "error", message: "call.error.unableStart" },
    }, peerConnection);
    expect(pushNotice).not.toHaveBeenCalled();
    expect(resetCallState).not.toHaveBeenCalled();
    expect(applyCallSecurityState).not.toHaveBeenCalled();
    expect(activeState.current?.mediaEncryptionMode).toBe("frame-v1");
    expect(activeState.current?.state).toBe("ringing");
  });

  it("keeps the call active when the transport is already connected before final answer state sync", async () => {
    const activeState = {
      current: createActiveCall({
        state: "active",
      }),
    };
    let remoteDescription: RTCSessionDescriptionInit | null = null;
    const peerConnection = {
      connectionState: "connected",
      iceConnectionState: "connected",
      get remoteDescription() {
        return remoteDescription as RTCSessionDescription | null;
      },
      setRemoteDescription: vi.fn(async (description: RTCSessionDescriptionInit) => {
        remoteDescription = description;
      }),
      addIceCandidate: vi.fn(async () => undefined),
    } as unknown as RTCPeerConnection;
    const runtimeRef = { current: null as NegotiationRuntimeApi | null };
    const configureDirectCallFrameCrypto = vi.fn(async () => true);
    const applyCallSecurityState = vi.fn(async () => undefined);
    const setActiveIfCurrent = vi.fn((callId: string, update: (current: ActiveCall) => ActiveCall) => {
      if (activeState.current?.callId !== callId) return;
      activeState.current = update(activeState.current);
    });

    await act(async () => {
      root.render(
        <HookHarness
          activeRef={activeState as MutableRefObject<ActiveCall | null>}
          peerConnectionRef={{ current: peerConnection }}
          supportsPeerRenegotiationV1Ref={{ current: false }}
          renegotiationUnsupportedRef={{ current: false }}
          pendingRenegotiationReasonRef={{ current: null }}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={{ current: null }}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          negotiationReadyRef={{ current: false }}
          lastRenegotiationAttemptRef={{ current: null }}
          lastSignalingErrorRef={{ current: null }}
          outboundMediaEncryptionOfferRef={{
            current: {
              preferredMode: "frame-v1",
              supportedModes: ["frame-v1", "transport"],
            },
          }}
          pendingIceCandidatesRef={{ current: [] }}
          setActive={vi.fn()}
          callSecurityMode="balanced"
          debugCallMedia={vi.fn()}
          recordLastRenegotiationAttempt={vi.fn()}
          shouldIgnoreUnexpectedPeerSignal={vi.fn(() => false)}
          isCurrentActiveCallContext={vi.fn(() => true)}
          resetCallState={vi.fn()}
          resetCallStateIfCurrent={vi.fn(() => true)}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          syncOutgoingVisualMediaStateTrackBindings={vi.fn()}
          configureDirectCallFrameCrypto={configureDirectCallFrameCrypto}
          applySignalVerificationResult={vi.fn()}
          applyCallSecurityState={applyCallSecurityState}
          setActiveIfCurrent={setActiveIfCurrent}
          pushNotice={vi.fn()}
          capture={(runtime) => {
            runtimeRef.current = runtime;
          }}
        />
      );
    });

    await act(async () => {
      await runtimeRef.current!.handleRemoteAnswer(createAnswerSignal());
    });

    expect(applyCallSecurityState).toHaveBeenCalledTimes(1);
    expect(activeState.current?.state).toBe("active");
    expect(activeState.current?.peerSupportsRenegotiationV1).toBe(true);
    expect(activeState.current?.mediaEncryptionMode).toBe("frame-v1");
  });

  it("signs outgoing renegotiation offers with the negotiated revision", async () => {
    const activeState = {
      current: createActiveCall({
        state: "active",
        peerSupportsRenegotiationV1: true,
      }),
    };
    let localDescription: RTCSessionDescriptionInit | null = null;
    const peerConnection = {
      signalingState: "stable",
      get localDescription() {
        return localDescription as RTCSessionDescription | null;
      },
      createOffer: vi.fn(async () => ({
        type: "offer" as const,
        sdp: "v=0\r\ns=-",
      })),
      setLocalDescription: vi.fn(async (description: RTCSessionDescriptionInit) => {
        localDescription = description;
      }),
    } as unknown as RTCPeerConnection;
    const runtimeRef = { current: null as NegotiationRuntimeApi | null };
    const recordLastRenegotiationAttempt = vi.fn();
    const debugCallMedia = vi.fn();
    const syncVisualTransceiverDirections = vi.fn();

    negotiationMocks.createSignedCallRenegotiationOfferAuth.mockResolvedValue({
      version: 1,
      senderUserId: "local-user",
      senderDeviceId: "local-device",
      recipientUserId: "peer-1",
      signedAt: "2026-03-14T12:00:00.000Z",
      sdpHash: "hash",
      signature: "signature",
    });

    await act(async () => {
      root.render(
        <HookHarness
          activeRef={activeState as MutableRefObject<ActiveCall | null>}
          peerConnectionRef={{ current: peerConnection }}
          supportsPeerRenegotiationV1Ref={{ current: true }}
          renegotiationUnsupportedRef={{ current: false }}
          pendingRenegotiationReasonRef={{ current: null }}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={{ current: null }}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          negotiationReadyRef={{ current: true }}
          lastRenegotiationAttemptRef={{ current: null }}
          lastSignalingErrorRef={{ current: null }}
          outboundMediaEncryptionOfferRef={{
            current: {
              preferredMode: "frame-v1",
              supportedModes: ["frame-v1", "transport"],
            },
          }}
          pendingIceCandidatesRef={{ current: [] }}
          setActive={vi.fn()}
          callSecurityMode="balanced"
          debugCallMedia={debugCallMedia}
          recordLastRenegotiationAttempt={recordLastRenegotiationAttempt}
          shouldIgnoreUnexpectedPeerSignal={vi.fn(() => false)}
          isCurrentActiveCallContext={vi.fn(() => true)}
          resetCallState={vi.fn()}
          resetCallStateIfCurrent={vi.fn(() => true)}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={syncVisualTransceiverDirections}
          syncOutgoingVisualMediaStateTrackBindings={vi.fn()}
          configureDirectCallFrameCrypto={vi.fn(async () => true)}
          applySignalVerificationResult={vi.fn()}
          applyCallSecurityState={vi.fn(async () => undefined)}
          setActiveIfCurrent={vi.fn()}
          pushNotice={vi.fn()}
          capture={(runtime) => {
            runtimeRef.current = runtime;
          }}
        />
      );
    });

    await act(async () => {
      await runtimeRef.current!.sendRenegotiationOffer("call-1", "screen-share-start");
    });

    expect(syncVisualTransceiverDirections).toHaveBeenCalledWith("call-1");
    expect(negotiationMocks.createSignedCallRenegotiationOfferAuth).toHaveBeenCalledWith({
      callId: "call-1",
      revision: 1,
      recipientUserId: "peer-1",
      sdp: "v=0\r\ns=-",
    });
    expect(negotiationMocks.wsSend).toHaveBeenCalledWith({
      type: "call.renegotiate.offer",
      callId: "call-1",
      revision: 1,
      sdp: "v=0\r\ns=-",
      auth: {
        version: 1,
        senderUserId: "local-user",
        senderDeviceId: "local-device",
        recipientUserId: "peer-1",
        signedAt: "2026-03-14T12:00:00.000Z",
        sdpHash: "hash",
        signature: "signature",
      },
    });
  });

  it("resends a dropped renegotiation offer after websocket reconnect without creating a new revision", async () => {
    const activeState = {
      current: createActiveCall({
        state: "active",
        peerSupportsRenegotiationV1: true,
      }),
    };
    let localDescription: RTCSessionDescriptionInit | null = null;
    const pendingLocalRenegotiationRevisionRef = { current: null as number | null };
    const peerConnection = {
      signalingState: "stable",
      get localDescription() {
        return localDescription as RTCSessionDescription | null;
      },
      createOffer: vi.fn(async () => ({
        type: "offer" as const,
        sdp: "v=0\r\ns=-",
      })),
      setLocalDescription: vi.fn(async (description: RTCSessionDescriptionInit) => {
        localDescription = description;
      }),
    } as unknown as RTCPeerConnection;
    const runtimeRef = { current: null as NegotiationRuntimeApi | null };

    negotiationMocks.createSignedCallRenegotiationOfferAuth.mockResolvedValue({
      version: 1,
      senderUserId: "local-user",
      senderDeviceId: "local-device",
      recipientUserId: "peer-1",
      signedAt: "2026-03-14T12:00:00.000Z",
      sdpHash: "hash",
      signature: "signature",
    });
    negotiationMocks.wsSend
      .mockReturnValueOnce({ status: "dropped" })
      .mockReturnValueOnce({ status: "sent" });

    await act(async () => {
      root.render(
        <HookHarness
          activeRef={activeState as MutableRefObject<ActiveCall | null>}
          peerConnectionRef={{ current: peerConnection }}
          supportsPeerRenegotiationV1Ref={{ current: true }}
          renegotiationUnsupportedRef={{ current: false }}
          pendingRenegotiationReasonRef={{ current: null }}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={pendingLocalRenegotiationRevisionRef}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          negotiationReadyRef={{ current: true }}
          lastRenegotiationAttemptRef={{ current: null }}
          lastSignalingErrorRef={{ current: null }}
          outboundMediaEncryptionOfferRef={{
            current: {
              preferredMode: "frame-v1",
              supportedModes: ["frame-v1", "transport"],
            },
          }}
          pendingIceCandidatesRef={{ current: [] }}
          setActive={vi.fn()}
          callSecurityMode="balanced"
          debugCallMedia={vi.fn()}
          recordLastRenegotiationAttempt={vi.fn()}
          shouldIgnoreUnexpectedPeerSignal={vi.fn(() => false)}
          isCurrentActiveCallContext={vi.fn(() => true)}
          resetCallState={vi.fn()}
          resetCallStateIfCurrent={vi.fn(() => true)}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          syncOutgoingVisualMediaStateTrackBindings={vi.fn()}
          configureDirectCallFrameCrypto={vi.fn(async () => true)}
          applySignalVerificationResult={vi.fn()}
          applyCallSecurityState={vi.fn(async () => undefined)}
          setActiveIfCurrent={vi.fn()}
          pushNotice={vi.fn()}
          capture={(runtime) => {
            runtimeRef.current = runtime;
          }}
        />
      );
    });

    await act(async () => {
      await runtimeRef.current!.sendRenegotiationOffer("call-1", "disconnect-recovery");
    });

    expect(negotiationMocks.wsSend).toHaveBeenCalledTimes(1);
    expect(peerConnection.createOffer).toHaveBeenCalledTimes(1);
    expect(pendingLocalRenegotiationRevisionRef.current).toBe(1);

    await act(async () => {
      negotiationMocks.emitConnectionChange(true);
      await Promise.resolve();
    });

    expect(peerConnection.createOffer).toHaveBeenCalledTimes(1);
    expect(negotiationMocks.wsSend).toHaveBeenCalledTimes(2);
    expect(negotiationMocks.wsSend).toHaveBeenNthCalledWith(1, {
      type: "call.renegotiate.offer",
      callId: "call-1",
      revision: 1,
      sdp: "v=0\r\ns=-",
      auth: {
        version: 1,
        senderUserId: "local-user",
        senderDeviceId: "local-device",
        recipientUserId: "peer-1",
        signedAt: "2026-03-14T12:00:00.000Z",
        sdpHash: "hash",
        signature: "signature",
      },
    });
    expect(negotiationMocks.wsSend).toHaveBeenNthCalledWith(2, {
      type: "call.renegotiate.offer",
      callId: "call-1",
      revision: 1,
      sdp: "v=0\r\ns=-",
      auth: {
        version: 1,
        senderUserId: "local-user",
        senderDeviceId: "local-device",
        recipientUserId: "peer-1",
        signedAt: "2026-03-14T12:00:00.000Z",
        sdpHash: "hash",
        signature: "signature",
      },
    });
  });
});

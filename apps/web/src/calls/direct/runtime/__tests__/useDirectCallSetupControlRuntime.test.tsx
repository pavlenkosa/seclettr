// @vitest-environment jsdom

import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActiveCall,
  IncomingCall,
} from "@/calls/direct/model/direct-call-types";
import type { DirectCallFinishSessionOptions } from "@/calls/direct/runtime/direct-call-runtime-types";
import { useDirectCallSetupControlRuntime } from "@/calls/direct/runtime/useDirectCallSetupControlRuntime";

const setupControlMocks = vi.hoisted(() => {
  const apiPost = vi.fn();
  const createSignedCallOfferAuth = vi.fn();
  const createSignedCallAnswerAuth = vi.fn();
  const verifyIncomingCallOffer = vi.fn();
  const wsSend = vi.fn();
  return {
    apiPost,
    createSignedCallOfferAuth,
    createSignedCallAnswerAuth,
    verifyIncomingCallOffer,
    wsSend,
  };
});

vi.mock("@/lib/api", () => ({
  api: {
    post: setupControlMocks.apiPost,
  },
}));

vi.mock("@/calls/direct/runtime/crypto/call-auth-actions", () => ({
  createSignedCallOfferAuth: setupControlMocks.createSignedCallOfferAuth,
  createSignedCallAnswerAuth: setupControlMocks.createSignedCallAnswerAuth,
  verifyIncomingCallOffer: setupControlMocks.verifyIncomingCallOffer,
}));

vi.mock("@/lib/websocket", () => ({
  wsClient: {
    send: setupControlMocks.wsSend,
  },
}));

type SetupControlRuntimeApi = ReturnType<typeof useDirectCallSetupControlRuntime>;
type ActiveCallStateUpdater =
  | ActiveCall
  | null
  | ((prev: ActiveCall | null) => ActiveCall | null);

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
  const tracks = [
    {
      id: "audio-track",
      stop: vi.fn(),
    },
  ] as unknown as MediaStreamTrack[];
  return {
    getTracks: () => tracks,
  } as unknown as MediaStream;
}

function createActiveStateRef() {
  return { current: null as ActiveCall | null } as MutableRefObject<ActiveCall | null>;
}

function HookHarness(props: {
  activeRef: MutableRefObject<ActiveCall | null>;
  incomingRef: MutableRefObject<IncomingCall | null>;
  acceptingIncomingCallRef?: MutableRefObject<IncomingCall | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  directCallLifecycleTokenRef: MutableRefObject<number>;
  outgoingRingingTimeoutRef?: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  directCallNegotiationRoleRef: MutableRefObject<"polite" | "impolite">;
  supportsPeerRenegotiationV1Ref: MutableRefObject<boolean>;
  renegotiationUnsupportedRef: MutableRefObject<boolean>;
  negotiationReadyRef: MutableRefObject<boolean>;
  makingOfferRef: MutableRefObject<boolean>;
  ignoreOfferRef: MutableRefObject<boolean>;
  isSettingRemoteAnswerPendingRef: MutableRefObject<boolean>;
  renegotiationRevisionRef: MutableRefObject<number>;
  lastAppliedRemoteRenegotiationRevisionRef: MutableRefObject<number>;
  pendingLocalRenegotiationRevisionRef: MutableRefObject<number | null>;
  pendingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
  incomingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
  outboundMediaEncryptionOfferRef: MutableRefObject<{
    preferredMode: "transport" | "frame-v1";
    supportedModes: readonly ("transport" | "frame-v1")[];
  } | null>;
  commitIncomingState: Dispatch<SetStateAction<IncomingCall | null>>;
  commitActiveState: Dispatch<SetStateAction<ActiveCall | null>>;
  setIsMinimized: Dispatch<SetStateAction<boolean>>;
  resetMinimizedDockState: () => void;
  clearNotice: () => void;
  callSecurityMode: "compatibility" | "balanced" | "strict";
  ensureConversationUsername: (userId: string, fallbackLabel?: string) => Promise<string | null>;
  resolvePeerLabel: (userId: string, fallbackLabel?: string) => string;
  pushNotice: (next: { kind: "info" | "error"; message: string }) => void;
  recordCallEvent: (event: Record<string, unknown>) => void;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  createPeerConnection: (callId: string) => Promise<RTCPeerConnection>;
  ensureVideoSenders: (pc: RTCPeerConnection) => void;
  requestLocalStream: (options: { withVideo: boolean }) => Promise<MediaStream>;
  attachLocalTracksToPeer: (pc: RTCPeerConnection, stream: MediaStream) => Promise<void>;
  syncVisualTransceiverBindings: () => void;
  syncVisualTransceiverDirections: (callId: string) => void;
  syncOutgoingVisualMediaStateTrackBindings?: (callIdOverride?: string) => void;
  refreshRemoteVideoTracksFromPeer?: (callIdOverride?: string, reason?: string) => void;
  resolveLocalSupportedMediaEncryptionModes: () => readonly ("transport" | "frame-v1")[];
  primeDirectCallSenderFrameCrypto: (callId: string) => boolean;
  closeDirectCallFrameCrypto: () => void;
  configureDirectCallFrameCrypto: (params: {
    callId: string;
    mediaEncryptionMode: "transport" | "frame-v1";
    peerUserId: string;
    peerDeviceId: string | null;
  }) => Promise<boolean>;
  applyCallSecurityState: (callId: string, pc: RTCPeerConnection) => Promise<void>;
  finishCallSession?: (opts: DirectCallFinishSessionOptions) => void;
  capture: (runtime: SetupControlRuntimeApi) => void;
}) {
  const runtime = useDirectCallSetupControlRuntime({
    activeRef: props.activeRef,
    incomingRef: props.incomingRef,
    acceptingIncomingCallRef: props.acceptingIncomingCallRef ?? { current: null },
    peerConnectionRef: props.peerConnectionRef,
    directCallLifecycleTokenRef: props.directCallLifecycleTokenRef,
    outgoingRingingTimeoutRef: props.outgoingRingingTimeoutRef ?? { current: null },
    directCallNegotiationRoleRef: props.directCallNegotiationRoleRef,
    supportsPeerRenegotiationV1Ref: props.supportsPeerRenegotiationV1Ref,
    renegotiationUnsupportedRef: props.renegotiationUnsupportedRef,
    negotiationReadyRef: props.negotiationReadyRef,
    makingOfferRef: props.makingOfferRef,
    ignoreOfferRef: props.ignoreOfferRef,
    isSettingRemoteAnswerPendingRef: props.isSettingRemoteAnswerPendingRef,
    renegotiationRevisionRef: props.renegotiationRevisionRef,
    lastAppliedRemoteRenegotiationRevisionRef: props.lastAppliedRemoteRenegotiationRevisionRef,
    pendingLocalRenegotiationRevisionRef: props.pendingLocalRenegotiationRevisionRef,
    pendingIceCandidatesRef: props.pendingIceCandidatesRef,
    incomingIceCandidatesRef: props.incomingIceCandidatesRef,
    outboundMediaEncryptionOfferRef: props.outboundMediaEncryptionOfferRef as MutableRefObject<any>,
    commitIncomingState: props.commitIncomingState,
    commitActiveState: props.commitActiveState,
    setIsMinimized: props.setIsMinimized,
    resetMinimizedDockState: props.resetMinimizedDockState,
    clearNotice: props.clearNotice,
    callSecurityMode: props.callSecurityMode,
    ensureConversationUsername: props.ensureConversationUsername,
    resolvePeerLabel: props.resolvePeerLabel,
    pushNotice: props.pushNotice as (next: any, timeoutMs?: number) => void,
    callChatKindRef: { current: null },
    recordCallEvent: props.recordCallEvent as (event: any) => void,
    debugCallMedia: props.debugCallMedia,
    createPeerConnection: props.createPeerConnection,
    ensureVideoSenders: props.ensureVideoSenders,
    requestLocalStream: props.requestLocalStream,
    attachLocalTracksToPeer: props.attachLocalTracksToPeer,
    syncVisualTransceiverBindings: props.syncVisualTransceiverBindings,
    syncVisualTransceiverDirections: props.syncVisualTransceiverDirections,
    syncOutgoingVisualMediaStateTrackBindings:
      props.syncOutgoingVisualMediaStateTrackBindings ?? (() => undefined),
    refreshRemoteVideoTracksFromPeer:
      props.refreshRemoteVideoTracksFromPeer ?? (() => undefined),
    resolveLocalSupportedMediaEncryptionModes: props.resolveLocalSupportedMediaEncryptionModes,
    primeDirectCallSenderFrameCrypto: props.primeDirectCallSenderFrameCrypto,
    closeDirectCallFrameCrypto: props.closeDirectCallFrameCrypto,
    configureDirectCallFrameCrypto: props.configureDirectCallFrameCrypto,
    prepareLocalEphemeralKey: vi.fn(async () => "mock-ephemeral-pub-key"),
    setPeerEphemeralPublicKey: vi.fn(),
    applyCallSecurityState: props.applyCallSecurityState,
    finishCallSession: props.finishCallSession ?? vi.fn((opts: DirectCallFinishSessionOptions) => {
      opts.onBeforeReset?.();
    }),
    t: (key: string) => key,
  });

  props.capture(runtime);
  return null;
}

describe("useDirectCallSetupControlRuntime", () => {
  let container: HTMLDivElement;
  let root: Root;
  let runtime: SetupControlRuntimeApi | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    runtime = null;
    vi.clearAllMocks();
    setupControlMocks.wsSend.mockReturnValue({ status: "sent" });
    setupControlMocks.createSignedCallOfferAuth.mockResolvedValue(null);
    setupControlMocks.createSignedCallAnswerAuth.mockResolvedValue(null);
    setupControlMocks.verifyIncomingCallOffer.mockResolvedValue({ state: "verified" });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("starts an outbound call through the setup boundary and commits ringing state", async () => {
    const activeState = createActiveStateRef();
    const incomingState = { current: null } as MutableRefObject<IncomingCall | null>;
    const commitActiveState = vi.fn((next: ActiveCallStateUpdater) => {
      activeState.current = typeof next === "function" ? next(activeState.current) : next;
    });
    const peerConnection = {
      createOffer: vi.fn(async () => ({ type: "offer", sdp: "offer-sdp" })),
      setLocalDescription: vi.fn(async () => undefined),
      close: vi.fn(),
    } as unknown as RTCPeerConnection;

    setupControlMocks.apiPost.mockResolvedValue({ callId: "call-1" });

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeState}
          incomingRef={incomingState}
          peerConnectionRef={{ current: null }}
          directCallLifecycleTokenRef={{ current: 0 }}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          supportsPeerRenegotiationV1Ref={{ current: false }}
          renegotiationUnsupportedRef={{ current: false }}
          negotiationReadyRef={{ current: false }}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={{ current: null }}
          pendingIceCandidatesRef={{ current: new Map() }}
          incomingIceCandidatesRef={{ current: new Map() }}
          outboundMediaEncryptionOfferRef={{ current: null }}
          commitIncomingState={vi.fn()}
          commitActiveState={commitActiveState}
          setIsMinimized={vi.fn()}
          resetMinimizedDockState={vi.fn()}
          clearNotice={vi.fn()}
          callSecurityMode="balanced"
          ensureConversationUsername={vi.fn(async () => "Peer One")}
          resolvePeerLabel={(userId, fallbackLabel) => fallbackLabel ?? userId}
          pushNotice={vi.fn()}
          recordCallEvent={vi.fn()}
          debugCallMedia={() => undefined}
          createPeerConnection={vi.fn(async () => peerConnection)}
          ensureVideoSenders={vi.fn()}
          requestLocalStream={vi.fn(async () => createFakeStream())}
          attachLocalTracksToPeer={vi.fn(async () => undefined)}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          resolveLocalSupportedMediaEncryptionModes={() => ["transport"]}
          primeDirectCallSenderFrameCrypto={vi.fn(() => true)}
          closeDirectCallFrameCrypto={vi.fn()}
          configureDirectCallFrameCrypto={vi.fn(async () => true)}
          applyCallSecurityState={vi.fn(async () => undefined)}          capture={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      );
    });

    if (!runtime) {
      throw new Error("Expected setup control runtime");
    }

    await act(async () => {
      await runtime?.startCall("peer-1", "audio", "Peer One");
    });

    expect(setupControlMocks.apiPost).toHaveBeenCalledWith("/calls", {
      calleeUserId: "peer-1",
      callType: "audio",
    });
    expect(setupControlMocks.wsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "call.offer",
        callId: "call-1",
        targetUserId: "peer-1",
      })
    );
    expect(setupControlMocks.createSignedCallOfferAuth).toHaveBeenCalledWith({
      callId: "call-1",
      recipientUserId: "peer-1",
      callType: "audio",
      sdp: "offer-sdp",
      mediaEncryption: {
        preferredMode: "transport",
        supportedModes: ["transport"],
      },
    });
    expect(activeState.current).toMatchObject({
      callId: "call-1",
      peerUserId: "peer-1",
      state: "ringing",
      direction: "outbound",
    });
  });

  it("advertises frame-v1 for outbound calls when balanced mode supports it locally", async () => {
    const activeState = createActiveStateRef();
    const incomingState = { current: null } as MutableRefObject<IncomingCall | null>;
    const peerConnection = {
      createOffer: vi.fn(async () => ({ type: "offer", sdp: "offer-sdp" })),
      setLocalDescription: vi.fn(async () => undefined),
      close: vi.fn(),
    } as unknown as RTCPeerConnection;

    setupControlMocks.apiPost.mockResolvedValue({ callId: "call-frame-offer" });

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeState}
          incomingRef={incomingState}
          peerConnectionRef={{ current: null }}
          directCallLifecycleTokenRef={{ current: 0 }}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          supportsPeerRenegotiationV1Ref={{ current: false }}
          renegotiationUnsupportedRef={{ current: false }}
          negotiationReadyRef={{ current: false }}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={{ current: null }}
          pendingIceCandidatesRef={{ current: new Map() }}
          incomingIceCandidatesRef={{ current: new Map() }}
          outboundMediaEncryptionOfferRef={{ current: null }}
          commitIncomingState={vi.fn()}
          commitActiveState={vi.fn()}
          setIsMinimized={vi.fn()}
          resetMinimizedDockState={vi.fn()}
          clearNotice={vi.fn()}
          callSecurityMode="balanced"
          ensureConversationUsername={vi.fn(async () => "Peer One")}
          resolvePeerLabel={(userId, fallbackLabel) => fallbackLabel ?? userId}
          pushNotice={vi.fn()}
          recordCallEvent={vi.fn()}
          debugCallMedia={vi.fn()}
          createPeerConnection={vi.fn(async () => peerConnection)}
          ensureVideoSenders={vi.fn()}
          requestLocalStream={vi.fn(async () => createFakeStream())}
          attachLocalTracksToPeer={vi.fn(async () => undefined)}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          resolveLocalSupportedMediaEncryptionModes={() => ["frame-v1", "transport"]}
          primeDirectCallSenderFrameCrypto={vi.fn(() => true)}
          closeDirectCallFrameCrypto={vi.fn()}
          configureDirectCallFrameCrypto={vi.fn(async () => true)}
          applyCallSecurityState={vi.fn(async () => undefined)}          capture={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      );
    });

    if (!runtime) {
      throw new Error("Expected setup control runtime");
    }

    await act(async () => {
      await runtime?.startCall("peer-1", "audio", "Peer One");
    });

    expect(setupControlMocks.createSignedCallOfferAuth).toHaveBeenCalledWith({
      callId: "call-frame-offer",
      recipientUserId: "peer-1",
      callType: "audio",
      sdp: "offer-sdp",
      mediaEncryption: {
        preferredMode: "frame-v1",
        supportedModes: ["frame-v1", "transport"],
        ephemeralPublicKey: "mock-ephemeral-pub-key",
      },
    });
    expect(setupControlMocks.wsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "call.offer",
        mediaEncryption: expect.objectContaining({
          preferredMode: "frame-v1",
          supportedModes: ["frame-v1", "transport"],
          ephemeralPublicKey: "mock-ephemeral-pub-key",
        }),
      })
    );
  });

  it("commits the outbound active ref before dispatching the initial offer", async () => {
    const activeState = createActiveStateRef();
    const incomingState = { current: null } as MutableRefObject<IncomingCall | null>;
    let activeRefAtOfferDispatch: ActiveCall | null = null;
    const commitActiveState = vi.fn((next: ActiveCallStateUpdater) => {
      const resolved = typeof next === "function" ? next(activeState.current) : next;
      activeState.current = resolved;
    });
    const peerConnection = {
      createOffer: vi.fn(async () => ({ type: "offer", sdp: "offer-sdp" })),
      setLocalDescription: vi.fn(async () => undefined),
      close: vi.fn(),
    } as unknown as RTCPeerConnection;

    setupControlMocks.apiPost.mockResolvedValue({ callId: "call-fast-answer" });
    setupControlMocks.wsSend.mockImplementation((message) => {
      if (message?.type === "call.offer") {
        activeRefAtOfferDispatch = activeState.current;
      }
      return { status: "sent" };
    });

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeState}
          incomingRef={incomingState}
          peerConnectionRef={{ current: null }}
          directCallLifecycleTokenRef={{ current: 0 }}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          supportsPeerRenegotiationV1Ref={{ current: false }}
          renegotiationUnsupportedRef={{ current: false }}
          negotiationReadyRef={{ current: false }}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={{ current: null }}
          pendingIceCandidatesRef={{ current: new Map() }}
          incomingIceCandidatesRef={{ current: new Map() }}
          outboundMediaEncryptionOfferRef={{ current: null }}
          commitIncomingState={vi.fn()}
          commitActiveState={commitActiveState}
          setIsMinimized={vi.fn()}
          resetMinimizedDockState={vi.fn()}
          clearNotice={vi.fn()}
          callSecurityMode="balanced"
          ensureConversationUsername={vi.fn(async () => "Peer One")}
          resolvePeerLabel={(userId, fallbackLabel) => fallbackLabel ?? userId}
          pushNotice={vi.fn()}
          recordCallEvent={vi.fn()}
          debugCallMedia={vi.fn()}
          createPeerConnection={vi.fn(async () => peerConnection)}
          ensureVideoSenders={vi.fn()}
          requestLocalStream={vi.fn(async () => createFakeStream())}
          attachLocalTracksToPeer={vi.fn(async () => undefined)}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          resolveLocalSupportedMediaEncryptionModes={() => ["transport"]}
          primeDirectCallSenderFrameCrypto={vi.fn(() => true)}
          closeDirectCallFrameCrypto={vi.fn()}
          configureDirectCallFrameCrypto={vi.fn(async () => true)}
          applyCallSecurityState={vi.fn(async () => undefined)}          capture={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      );
    });

    if (!runtime) {
      throw new Error("Expected setup control runtime");
    }

    await act(async () => {
      await runtime?.startCall("peer-1", "audio", "Peer One");
    });

    expect(activeRefAtOfferDispatch).toMatchObject({
      callId: "call-fast-answer",
      peerUserId: "peer-1",
      state: "ringing",
      direction: "outbound",
    });
    expect(activeState.current).toMatchObject({
      callId: "call-fast-answer",
      peerUserId: "peer-1",
      state: "ringing",
    });
  });

  it("signs the same media-encryption answer payload that it sends to the peer", async () => {
    const incomingState = { current: createIncomingCall() } as MutableRefObject<IncomingCall | null>;
    const negotiationReadyRef = { current: false };
    let negotiationReadyDuringSecurityState: boolean | null = null;
    let negotiationReadyDuringAnswerSigning: boolean | null = null;
    const peerConnection = {
      setRemoteDescription: vi.fn(async () => undefined),
      createAnswer: vi.fn(async () => ({ type: "answer", sdp: "answer-sdp" })),
      setLocalDescription: vi.fn(async () => undefined),
      addIceCandidate: vi.fn(async () => undefined),
      close: vi.fn(),
    } as unknown as RTCPeerConnection;

    act(() => {
      root.render(
        <HookHarness
          activeRef={createActiveStateRef()}
          incomingRef={incomingState}
          peerConnectionRef={{ current: null }}
          directCallLifecycleTokenRef={{ current: 0 }}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          supportsPeerRenegotiationV1Ref={{ current: false }}
          renegotiationUnsupportedRef={{ current: false }}
          negotiationReadyRef={negotiationReadyRef}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={{ current: null }}
          pendingIceCandidatesRef={{ current: new Map() }}
          incomingIceCandidatesRef={{ current: new Map() }}
          outboundMediaEncryptionOfferRef={{ current: null }}
          commitIncomingState={vi.fn()}
          commitActiveState={vi.fn()}
          setIsMinimized={vi.fn()}
          resetMinimizedDockState={vi.fn()}
          clearNotice={vi.fn()}
          callSecurityMode="balanced"
          ensureConversationUsername={vi.fn(async () => null)}
          resolvePeerLabel={(userId, fallbackLabel) => fallbackLabel ?? userId}
          pushNotice={vi.fn()}
          recordCallEvent={vi.fn()}
          debugCallMedia={vi.fn()}
          createPeerConnection={vi.fn(async () => peerConnection)}
          ensureVideoSenders={vi.fn()}
          requestLocalStream={vi.fn(async () => createFakeStream())}
          attachLocalTracksToPeer={vi.fn(async () => undefined)}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          resolveLocalSupportedMediaEncryptionModes={() => ["transport"]}
          primeDirectCallSenderFrameCrypto={vi.fn(() => true)}
          closeDirectCallFrameCrypto={vi.fn()}
          configureDirectCallFrameCrypto={vi.fn(async () => true)}
          applyCallSecurityState={vi.fn(async () => {
            negotiationReadyDuringSecurityState = negotiationReadyRef.current;
          })}          capture={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      );
    });

    if (!runtime) {
      throw new Error("Expected setup control runtime");
    }

    setupControlMocks.createSignedCallAnswerAuth.mockImplementation(async (payload) => {
      negotiationReadyDuringAnswerSigning = negotiationReadyRef.current;
      return payload;
    });

    await act(async () => {
      await runtime?.acceptCall();
    });

    expect(setupControlMocks.createSignedCallAnswerAuth).toHaveBeenCalledWith({
      callId: "call-incoming",
      recipientUserId: "peer-2",
      sdp: "answer-sdp",
      mediaEncryption: {
        selectedMode: "transport",
        supportedModes: ["transport"],
      },
    });
    expect(setupControlMocks.wsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "call.answer",
        callId: "call-incoming",
        sdp: "answer-sdp",
        mediaEncryption: {
          selectedMode: "transport",
          supportedModes: ["transport"],
        },
      })
    );
    expect(negotiationReadyDuringSecurityState).toBe(false);
    expect(negotiationReadyDuringAnswerSigning).toBe(false);
    expect(negotiationReadyRef.current).toBe(true);
  });

  it("downgrades an inbound frame-capable offer to transport when local policy prefers compatibility", async () => {
    const incomingState = {
      current: createIncomingCall({
        mediaEncryptionOffer: {
          preferredMode: "frame-v1",
          supportedModes: ["frame-v1", "transport"],
        },
      }),
    } as MutableRefObject<IncomingCall | null>;
    const peerConnection = {
      setRemoteDescription: vi.fn(async () => undefined),
      createAnswer: vi.fn(async () => ({ type: "answer", sdp: "answer-sdp" })),
      setLocalDescription: vi.fn(async () => undefined),
      addIceCandidate: vi.fn(async () => undefined),
      close: vi.fn(),
    } as unknown as RTCPeerConnection;
    const configureDirectCallFrameCrypto = vi.fn(async () => true);

    act(() => {
      root.render(
        <HookHarness
          activeRef={createActiveStateRef()}
          incomingRef={incomingState}
          peerConnectionRef={{ current: null }}
          directCallLifecycleTokenRef={{ current: 0 }}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          supportsPeerRenegotiationV1Ref={{ current: false }}
          renegotiationUnsupportedRef={{ current: false }}
          negotiationReadyRef={{ current: false }}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={{ current: null }}
          pendingIceCandidatesRef={{ current: new Map() }}
          incomingIceCandidatesRef={{ current: new Map() }}
          outboundMediaEncryptionOfferRef={{ current: null }}
          commitIncomingState={vi.fn()}
          commitActiveState={vi.fn()}
          setIsMinimized={vi.fn()}
          resetMinimizedDockState={vi.fn()}
          clearNotice={vi.fn()}
          callSecurityMode="compatibility"
          ensureConversationUsername={vi.fn(async () => null)}
          resolvePeerLabel={(userId, fallbackLabel) => fallbackLabel ?? userId}
          pushNotice={vi.fn()}
          recordCallEvent={vi.fn()}
          debugCallMedia={vi.fn()}
          createPeerConnection={vi.fn(async () => peerConnection)}
          ensureVideoSenders={vi.fn()}
          requestLocalStream={vi.fn(async () => createFakeStream())}
          attachLocalTracksToPeer={vi.fn(async () => undefined)}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          resolveLocalSupportedMediaEncryptionModes={() => ["frame-v1", "transport"]}
          primeDirectCallSenderFrameCrypto={vi.fn(() => true)}
          closeDirectCallFrameCrypto={vi.fn()}
          configureDirectCallFrameCrypto={configureDirectCallFrameCrypto}
          applyCallSecurityState={vi.fn(async () => undefined)}          capture={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      );
    });

    if (!runtime) {
      throw new Error("Expected setup control runtime");
    }

    await act(async () => {
      await runtime?.acceptCall();
    });

    expect(configureDirectCallFrameCrypto).toHaveBeenCalledWith({
      callId: "call-incoming",
      mediaEncryptionMode: "transport",
      peerUserId: "peer-2",
      peerDeviceId: "device-2",
    });
    expect(setupControlMocks.createSignedCallAnswerAuth).toHaveBeenCalledWith({
      callId: "call-incoming",
      recipientUserId: "peer-2",
      sdp: "answer-sdp",
      mediaEncryption: {
        selectedMode: "transport",
        supportedModes: ["frame-v1", "transport"],
      },
    });
    expect(setupControlMocks.wsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "call.answer",
        mediaEncryption: {
          selectedMode: "transport",
          supportedModes: ["frame-v1", "transport"],
        },
      })
    );
  });

  it("commits inbound refs before dispatching the initial answer", async () => {
    const activeState = createActiveStateRef();
    const incomingState = { current: createIncomingCall() } as MutableRefObject<IncomingCall | null>;
    let activeRefAtAnswerDispatch: ActiveCall | null = null;
    let incomingRefAtAnswerDispatch: IncomingCall | null = createIncomingCall();
    const commitActiveState = vi.fn((next: ActiveCallStateUpdater) => {
      const resolved = typeof next === "function" ? next(activeState.current) : next;
      activeState.current = resolved;
    });
    const commitIncomingState = vi.fn((next: IncomingCall | null | ((prev: IncomingCall | null) => IncomingCall | null)) => {
      const resolved = typeof next === "function" ? next(incomingState.current) : next;
      incomingState.current = resolved;
    });
    const peerConnection = {
      setRemoteDescription: vi.fn(async () => undefined),
      createAnswer: vi.fn(async () => ({ type: "answer", sdp: "answer-sdp" })),
      setLocalDescription: vi.fn(async () => undefined),
      addIceCandidate: vi.fn(async () => undefined),
      close: vi.fn(),
    } as unknown as RTCPeerConnection;

    setupControlMocks.wsSend.mockImplementation((message) => {
      if (message?.type === "call.answer") {
        activeRefAtAnswerDispatch = activeState.current;
        incomingRefAtAnswerDispatch = incomingState.current;
      }
      return { status: "sent" };
    });

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeState}
          incomingRef={incomingState}
          peerConnectionRef={{ current: null }}
          directCallLifecycleTokenRef={{ current: 0 }}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          supportsPeerRenegotiationV1Ref={{ current: false }}
          renegotiationUnsupportedRef={{ current: false }}
          negotiationReadyRef={{ current: false }}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={{ current: null }}
          pendingIceCandidatesRef={{ current: new Map() }}
          incomingIceCandidatesRef={{ current: new Map() }}
          outboundMediaEncryptionOfferRef={{ current: null }}
          commitIncomingState={commitIncomingState}
          commitActiveState={commitActiveState}
          setIsMinimized={vi.fn()}
          resetMinimizedDockState={vi.fn()}
          clearNotice={vi.fn()}
          callSecurityMode="balanced"
          ensureConversationUsername={vi.fn(async () => null)}
          resolvePeerLabel={(userId, fallbackLabel) => fallbackLabel ?? userId}
          pushNotice={vi.fn()}
          recordCallEvent={vi.fn()}
          debugCallMedia={vi.fn()}
          createPeerConnection={vi.fn(async () => peerConnection)}
          ensureVideoSenders={vi.fn()}
          requestLocalStream={vi.fn(async () => createFakeStream())}
          attachLocalTracksToPeer={vi.fn(async () => undefined)}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          resolveLocalSupportedMediaEncryptionModes={() => ["transport"]}
          primeDirectCallSenderFrameCrypto={vi.fn(() => true)}
          closeDirectCallFrameCrypto={vi.fn()}
          configureDirectCallFrameCrypto={vi.fn(async () => true)}
          applyCallSecurityState={vi.fn(async () => undefined)}          capture={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      );
    });

    if (!runtime) {
      throw new Error("Expected setup control runtime");
    }

    await act(async () => {
      await runtime?.acceptCall();
    });

    expect(activeRefAtAnswerDispatch).toMatchObject({
      callId: "call-incoming",
      peerUserId: "peer-2",
      state: "connecting",
      direction: "inbound",
    });
    expect(incomingRefAtAnswerDispatch).toBeNull();
    expect(activeState.current).toMatchObject({
      callId: "call-incoming",
      peerUserId: "peer-2",
      state: "connecting",
    });
    expect(incomingState.current).toBeNull();
  });

  it("claims visual senders only after applying the remote offer on accept", async () => {
    const incomingState = { current: createIncomingCall() } as MutableRefObject<IncomingCall | null>;
    const stepOrder: string[] = [];
    const peerConnection = {
      setRemoteDescription: vi.fn(async () => {
        stepOrder.push("set-remote-description");
      }),
      createAnswer: vi.fn(async () => ({ type: "answer", sdp: "answer-sdp" })),
      setLocalDescription: vi.fn(async () => undefined),
      addIceCandidate: vi.fn(async () => undefined),
      close: vi.fn(),
    } as unknown as RTCPeerConnection;
    const ensureVideoSenders = vi.fn(() => {
      stepOrder.push("ensure-video-senders");
    });

    act(() => {
      root.render(
        <HookHarness
          activeRef={createActiveStateRef()}
          incomingRef={incomingState}
          peerConnectionRef={{ current: null }}
          directCallLifecycleTokenRef={{ current: 0 }}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          supportsPeerRenegotiationV1Ref={{ current: false }}
          renegotiationUnsupportedRef={{ current: false }}
          negotiationReadyRef={{ current: false }}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={{ current: null }}
          pendingIceCandidatesRef={{ current: new Map() }}
          incomingIceCandidatesRef={{ current: new Map() }}
          outboundMediaEncryptionOfferRef={{ current: null }}
          commitIncomingState={vi.fn()}
          commitActiveState={vi.fn()}
          setIsMinimized={vi.fn()}
          resetMinimizedDockState={vi.fn()}
          clearNotice={vi.fn()}
          callSecurityMode="balanced"
          ensureConversationUsername={vi.fn(async () => null)}
          resolvePeerLabel={(userId, fallbackLabel) => fallbackLabel ?? userId}
          pushNotice={vi.fn()}
          recordCallEvent={vi.fn()}
          debugCallMedia={vi.fn()}
          createPeerConnection={vi.fn(async () => peerConnection)}
          ensureVideoSenders={ensureVideoSenders}
          requestLocalStream={vi.fn(async () => createFakeStream())}
          attachLocalTracksToPeer={vi.fn(async () => undefined)}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          resolveLocalSupportedMediaEncryptionModes={() => ["transport"]}
          primeDirectCallSenderFrameCrypto={vi.fn(() => true)}
          closeDirectCallFrameCrypto={vi.fn()}
          configureDirectCallFrameCrypto={vi.fn(async () => true)}
          applyCallSecurityState={vi.fn(async () => undefined)}          capture={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      );
    });

    if (!runtime) {
      throw new Error("Expected setup control runtime");
    }

    await act(async () => {
      await runtime?.acceptCall();
    });

    expect(stepOrder).toEqual(["set-remote-description", "ensure-video-senders"]);
  });

  it("hard-rejects invalid incoming verification in strict mode before peer setup", async () => {
    const incomingState = { current: createIncomingCall() } as MutableRefObject<IncomingCall | null>;
    const createPeerConnection = vi.fn();
    const pushNotice = vi.fn();
    const finishCallSession = vi.fn((opts: DirectCallFinishSessionOptions) => {
      opts.onBeforeReset?.();
    });
    setupControlMocks.verifyIncomingCallOffer.mockResolvedValue({ state: "invalid" });

    act(() => {
      root.render(
        <HookHarness
          activeRef={createActiveStateRef()}
          incomingRef={incomingState}
          peerConnectionRef={{ current: null }}
          directCallLifecycleTokenRef={{ current: 0 }}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          supportsPeerRenegotiationV1Ref={{ current: false }}
          renegotiationUnsupportedRef={{ current: false }}
          negotiationReadyRef={{ current: false }}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={{ current: null }}
          pendingIceCandidatesRef={{ current: new Map() }}
          incomingIceCandidatesRef={{ current: new Map() }}
          outboundMediaEncryptionOfferRef={{ current: null }}
          commitIncomingState={vi.fn()}
          commitActiveState={vi.fn()}
          setIsMinimized={vi.fn()}
          resetMinimizedDockState={vi.fn()}
          clearNotice={vi.fn()}
          callSecurityMode="strict"
          ensureConversationUsername={vi.fn(async () => null)}
          resolvePeerLabel={(userId, fallbackLabel) => fallbackLabel ?? userId}
          pushNotice={pushNotice}
          recordCallEvent={vi.fn()}
          debugCallMedia={() => undefined}
          createPeerConnection={createPeerConnection}
          ensureVideoSenders={vi.fn()}
          requestLocalStream={vi.fn(async () => createFakeStream())}
          attachLocalTracksToPeer={vi.fn(async () => undefined)}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          resolveLocalSupportedMediaEncryptionModes={() => ["transport"]}
          primeDirectCallSenderFrameCrypto={vi.fn(() => true)}
          closeDirectCallFrameCrypto={vi.fn()}
          configureDirectCallFrameCrypto={vi.fn(async () => true)}
          applyCallSecurityState={vi.fn(async () => undefined)}          finishCallSession={finishCallSession}
          capture={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      );
    });

    if (!runtime) {
      throw new Error("Expected setup control runtime");
    }

    await act(async () => {
      await runtime?.acceptCall();
    });

    expect(finishCallSession).toHaveBeenCalledWith({
      reason: "setup-failed",
      authority: "reject",
      callId: "call-incoming",
      notice: { kind: "error", message: "call.error.unableVerifyCode" },
    });
    expect(createPeerConnection).not.toHaveBeenCalled();
    expect(pushNotice).not.toHaveBeenCalled();
  });

  it("fails closed when the initial offer cannot be delivered immediately", async () => {
    const activeState = createActiveStateRef();
    const incomingState = { current: null } as MutableRefObject<IncomingCall | null>;
    const finishCallSession = vi.fn((opts: DirectCallFinishSessionOptions) => {
      opts.onBeforeReset?.();
    });
    const peerConnection = {
      createOffer: vi.fn(async () => ({ type: "offer", sdp: "offer-sdp" })),
      setLocalDescription: vi.fn(async () => undefined),
      close: vi.fn(),
    } as unknown as RTCPeerConnection;

    setupControlMocks.apiPost.mockResolvedValue({ callId: "call-failed-offer" });
    setupControlMocks.wsSend.mockReturnValue({ status: "queued" });

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeState}
          incomingRef={incomingState}
          peerConnectionRef={{ current: null }}
          directCallLifecycleTokenRef={{ current: 0 }}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          supportsPeerRenegotiationV1Ref={{ current: false }}
          renegotiationUnsupportedRef={{ current: false }}
          negotiationReadyRef={{ current: false }}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={{ current: null }}
          pendingIceCandidatesRef={{ current: new Map() }}
          incomingIceCandidatesRef={{ current: new Map() }}
          outboundMediaEncryptionOfferRef={{ current: null }}
          commitIncomingState={vi.fn()}
          commitActiveState={vi.fn()}
          setIsMinimized={vi.fn()}
          resetMinimizedDockState={vi.fn()}
          clearNotice={vi.fn()}
          callSecurityMode="balanced"
          ensureConversationUsername={vi.fn(async () => "Peer One")}
          resolvePeerLabel={(userId, fallbackLabel) => fallbackLabel ?? userId}
          pushNotice={vi.fn()}
          recordCallEvent={vi.fn()}
          debugCallMedia={vi.fn()}
          createPeerConnection={vi.fn(async () => peerConnection)}
          ensureVideoSenders={vi.fn()}
          requestLocalStream={vi.fn(async () => createFakeStream())}
          attachLocalTracksToPeer={vi.fn(async () => undefined)}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          resolveLocalSupportedMediaEncryptionModes={() => ["transport"]}
          primeDirectCallSenderFrameCrypto={vi.fn(() => true)}
          closeDirectCallFrameCrypto={vi.fn()}
          configureDirectCallFrameCrypto={vi.fn(async () => true)}
          applyCallSecurityState={vi.fn(async () => undefined)}          finishCallSession={finishCallSession}
          capture={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      );
    });

    if (!runtime) {
      throw new Error("Expected setup control runtime");
    }

    await act(async () => {
      await expect(
        runtime?.startCall("peer-1", "audio", "Peer One")
      ).rejects.toThrow("call.error.unableStart");
    });

    expect(finishCallSession).toHaveBeenCalledWith({
      reason: "setup-failed",
      authority: "hangup",
      callId: "call-failed-offer",
      notice: { kind: "error", message: "call.error.unableStart" },
    });
  });

  it("fails closed when the initial answer cannot be delivered immediately", async () => {
    const incomingState = { current: createIncomingCall() } as MutableRefObject<IncomingCall | null>;
    const finishCallSession = vi.fn((opts: DirectCallFinishSessionOptions) => {
      opts.onBeforeReset?.();
    });
    const peerConnection = {
      setRemoteDescription: vi.fn(async () => undefined),
      createAnswer: vi.fn(async () => ({ type: "answer", sdp: "answer-sdp" })),
      setLocalDescription: vi.fn(async () => undefined),
      close: vi.fn(),
    } as unknown as RTCPeerConnection;

    setupControlMocks.wsSend.mockReturnValue({ status: "dropped" });

    act(() => {
      root.render(
        <HookHarness
          activeRef={createActiveStateRef()}
          incomingRef={incomingState}
          peerConnectionRef={{ current: null }}
          directCallLifecycleTokenRef={{ current: 0 }}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          supportsPeerRenegotiationV1Ref={{ current: false }}
          renegotiationUnsupportedRef={{ current: false }}
          negotiationReadyRef={{ current: false }}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={{ current: null }}
          pendingIceCandidatesRef={{ current: new Map() }}
          incomingIceCandidatesRef={{ current: new Map() }}
          outboundMediaEncryptionOfferRef={{ current: null }}
          commitIncomingState={vi.fn()}
          commitActiveState={vi.fn()}
          setIsMinimized={vi.fn()}
          resetMinimizedDockState={vi.fn()}
          clearNotice={vi.fn()}
          callSecurityMode="balanced"
          ensureConversationUsername={vi.fn(async () => null)}
          resolvePeerLabel={(userId, fallbackLabel) => fallbackLabel ?? userId}
          pushNotice={vi.fn()}
          recordCallEvent={vi.fn()}
          debugCallMedia={vi.fn()}
          createPeerConnection={vi.fn(async () => peerConnection)}
          ensureVideoSenders={vi.fn()}
          requestLocalStream={vi.fn(async () => createFakeStream())}
          attachLocalTracksToPeer={vi.fn(async () => undefined)}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          resolveLocalSupportedMediaEncryptionModes={() => ["transport"]}
          primeDirectCallSenderFrameCrypto={vi.fn(() => true)}
          closeDirectCallFrameCrypto={vi.fn()}
          configureDirectCallFrameCrypto={vi.fn(async () => true)}
          applyCallSecurityState={vi.fn(async () => undefined)}          finishCallSession={finishCallSession}
          capture={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      );
    });

    if (!runtime) {
      throw new Error("Expected setup control runtime");
    }

    await act(async () => {
      await runtime?.acceptCall();
    });

    expect(finishCallSession).toHaveBeenCalledWith(expect.objectContaining({
      reason: "setup-failed",
      authority: "reject",
      callId: "call-incoming",
      notice: { kind: "error", message: "call.error.unableStart" },
      onBeforeReset: expect.any(Function),
    }));
  });

  it("uses the authoritative reject path when the user declines an incoming call", async () => {
    const incomingState = { current: createIncomingCall() } as MutableRefObject<IncomingCall | null>;
    const commitIncomingState = vi.fn(
      (next: IncomingCall | null | ((prev: IncomingCall | null) => IncomingCall | null)) => {
        incomingState.current =
          typeof next === "function" ? next(incomingState.current) : next;
      }
    );
    const finishCallSession = vi.fn((opts: DirectCallFinishSessionOptions) => {
      opts.onBeforeReset?.();
    });
    const pushNotice = vi.fn();

    act(() => {
      root.render(
        <HookHarness
          activeRef={createActiveStateRef()}
          incomingRef={incomingState}
          peerConnectionRef={{ current: null }}
          directCallLifecycleTokenRef={{ current: 0 }}
          directCallNegotiationRoleRef={{ current: "impolite" }}
          supportsPeerRenegotiationV1Ref={{ current: false }}
          renegotiationUnsupportedRef={{ current: false }}
          negotiationReadyRef={{ current: false }}
          makingOfferRef={{ current: false }}
          ignoreOfferRef={{ current: false }}
          isSettingRemoteAnswerPendingRef={{ current: false }}
          renegotiationRevisionRef={{ current: 0 }}
          lastAppliedRemoteRenegotiationRevisionRef={{ current: 0 }}
          pendingLocalRenegotiationRevisionRef={{ current: null }}
          pendingIceCandidatesRef={{ current: new Map() }}
          incomingIceCandidatesRef={{ current: new Map() }}
          outboundMediaEncryptionOfferRef={{ current: null }}
          commitIncomingState={commitIncomingState}
          commitActiveState={vi.fn()}
          setIsMinimized={vi.fn()}
          resetMinimizedDockState={vi.fn()}
          clearNotice={vi.fn()}
          callSecurityMode="balanced"
          ensureConversationUsername={vi.fn(async () => null)}
          resolvePeerLabel={(userId, fallbackLabel) => fallbackLabel ?? userId}
          pushNotice={pushNotice}
          recordCallEvent={vi.fn()}
          debugCallMedia={vi.fn()}
          createPeerConnection={vi.fn(async () => {
            throw new Error("should not create peer connection");
          })}
          ensureVideoSenders={vi.fn()}
          requestLocalStream={vi.fn(async () => createFakeStream())}
          attachLocalTracksToPeer={vi.fn(async () => undefined)}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          resolveLocalSupportedMediaEncryptionModes={() => ["transport"]}
          primeDirectCallSenderFrameCrypto={vi.fn(() => true)}
          closeDirectCallFrameCrypto={vi.fn()}
          configureDirectCallFrameCrypto={vi.fn(async () => true)}
          applyCallSecurityState={vi.fn(async () => undefined)}          finishCallSession={finishCallSession}
          capture={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      );
    });

    if (!runtime) {
      throw new Error("Expected setup control runtime");
    }

    await act(async () => {
      runtime?.rejectCall();
    });

    expect(finishCallSession).toHaveBeenCalledWith(expect.objectContaining({
      reason: "local-reject",
      authority: "reject",
      callId: "call-incoming",
      notice: { kind: "info", message: "call.notice.declined" },
      onBeforeReset: expect.any(Function),
    }));
    expect(pushNotice).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ActiveCall,
  CallNotice,
  IncomingCall,
} from "@/calls/direct/model/direct-call-types";
import type { DirectCallFinishSessionOptions } from "@/calls/direct/runtime/direct-call-runtime-types";
import { useDirectCallSignalRuntime } from "@/calls/direct/runtime/useDirectCallSignalRuntime";

const signalRuntimeMocks = vi.hoisted(() => {
  const subscriptionState: { handlers: Record<string, unknown> | null } = { handlers: null };
  return {
    subscriptionState,
  };
});

vi.mock("@/calls/direct/runtime/signal/useDirectCallSignalSubscription", () => ({
  useDirectCallSignalSubscription: (handlers: Record<string, unknown>) => {
    signalRuntimeMocks.subscriptionState.handlers = handlers;
  },
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

function HookHarness(props: {
  activeRef: MutableRefObject<ActiveCall | null>;
  incomingRef: MutableRefObject<IncomingCall | null>;
  acceptingIncomingCallRef: MutableRefObject<IncomingCall | null>;
  peerConnectionRef?: MutableRefObject<RTCPeerConnection | null>;
  incomingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
  pendingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
  lastSignalingErrorRef?: MutableRefObject<Record<string, unknown> | null>;
  rejectIncomingCall?: (callId: string) => void;
  resetCallState?: (opts?: { sendHangup?: boolean; notice?: CallNotice }) => void;
  finishCallSession?: (opts: DirectCallFinishSessionOptions) => void;
  handleRemoteAnswer?: (message: Record<string, unknown>) => Promise<void>;
  handleIncomingRenegotiationOffer?: (message: Record<string, unknown>) => Promise<void>;
  handleIncomingRenegotiationAnswer?: (message: Record<string, unknown>) => Promise<void>;
}) {
  useDirectCallSignalRuntime({
    activeRef: props.activeRef,
    incomingRef: props.incomingRef,
    acceptingIncomingCallRef: props.acceptingIncomingCallRef,
    peerConnectionRef: props.peerConnectionRef ?? { current: null },
    incomingIceCandidatesRef: props.incomingIceCandidatesRef,
    pendingIceCandidatesRef: props.pendingIceCandidatesRef,
    ignoreOfferRef: { current: false },
    supportsPeerRenegotiationV1Ref: { current: false },
    renegotiationUnsupportedRef: { current: false },
    lastSignalingErrorRef: props.lastSignalingErrorRef ?? { current: null },
    lastRenegotiationAttemptRef: { current: null },
    remoteMediaStateSeqRef: { current: { camera: 0, screen: 0, mic: 0 } },
    remoteMediaStateRevisionRef: { current: { camera: 0, screen: 0, mic: 0 } },
    lastIncomingMediaStateRef: { current: { camera: null, screen: null, mic: null } },
    remoteCameraSlotRef: { current: { source: "camera", trackId: null, stream: null, status: "inactive", lastFrameAt: 0, lastPacketAt: 0, mid: null, signaledActivity: null } },
    remoteScreenSlotRef: { current: { source: "screen", trackId: null, stream: null, status: "inactive", lastFrameAt: 0, lastPacketAt: 0, mid: null, signaledActivity: null } },
    setActive: vi.fn(),
    setIncoming: vi.fn(),
    setIsMinimized: vi.fn(),
    ensureConversationUsername: vi.fn(async () => null),
    resetMinimizedDockState: vi.fn(),
    resolvePeerLabel: (userId: string, fallbackLabel?: string) => fallbackLabel ?? userId,
    pushNotice: vi.fn(),
    callChatKindRef: { current: null },
    recordCallEvent: vi.fn(),
    rejectIncomingCall: props.rejectIncomingCall ?? vi.fn(),
    finishCallSession: props.finishCallSession ?? vi.fn((opts: DirectCallFinishSessionOptions) => {
      opts.onBeforeReset?.();
    }),
    debugCallMedia: vi.fn(),
    shouldIgnoreUnexpectedPeerSignal: () => false,
    processIncomingMediaStateHint: vi.fn(),
    handleRemoteAnswer: props.handleRemoteAnswer ?? vi.fn(async () => undefined),
    handleIncomingRenegotiationOffer: props.handleIncomingRenegotiationOffer ?? vi.fn(async () => undefined),
    handleIncomingRenegotiationAnswer: props.handleIncomingRenegotiationAnswer ?? vi.fn(async () => undefined),
    t: (key: string) => key,
  });

  return null;
}

describe("useDirectCallSignalRuntime", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    signalRuntimeMocks.subscriptionState.handlers = null;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("queues late ICE candidates while an incoming call is being accepted", () => {
    const incomingIceCandidatesRef = {
      current: new Map<string, RTCIceCandidateInit[]>(),
    } as MutableRefObject<Map<string, RTCIceCandidateInit[]>>;

    act(() => {
      root.render(
        <HookHarness
          activeRef={{ current: null }}
          incomingRef={{ current: null }}
          acceptingIncomingCallRef={{ current: createIncomingCall() }}
          incomingIceCandidatesRef={incomingIceCandidatesRef}
          pendingIceCandidatesRef={{ current: new Map() }}
        />
      );
    });

    const handlers = signalRuntimeMocks.subscriptionState.handlers as {
      onIceCandidate: (callId: string, candidate: RTCIceCandidateInit) => void;
    };

    act(() => {
      handlers.onIceCandidate("call-incoming", {
        candidate: "candidate:late",
        sdpMid: "0",
      });
    });

    expect(incomingIceCandidatesRef.current.get("call-incoming")).toEqual([
      { candidate: "candidate:late", sdpMid: "0" },
    ]);
  });

  it("rejects a competing incoming offer while another inbound call is already in accept transition", () => {
    const rejectIncomingCall = vi.fn();

    act(() => {
      root.render(
        <HookHarness
          activeRef={{ current: null }}
          incomingRef={{ current: null }}
          acceptingIncomingCallRef={{ current: createIncomingCall() }}
          incomingIceCandidatesRef={{ current: new Map() }}
          pendingIceCandidatesRef={{ current: new Map() }}
          rejectIncomingCall={rejectIncomingCall}
        />
      );
    });

    const handlers = signalRuntimeMocks.subscriptionState.handlers as {
      onOffer: (message: Record<string, unknown>) => void;
    };

    act(() => {
      handlers.onOffer({
        type: "call.offer",
        callId: "call-competing",
        callerUserId: "peer-other",
        callerDeviceId: "device-other",
        targetUserId: "user-1",
        sdp: "offer-sdp",
        callType: "audio",
      });
    });

    expect(rejectIncomingCall).toHaveBeenCalledWith("call-competing");
  });

  it("resets the current call when the initial answer handler throws", async () => {
    const activeRef = {
      current: {
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
      },
    } as MutableRefObject<ActiveCall | null>;
    const finishCallSession = vi.fn((opts: DirectCallFinishSessionOptions) => {
      opts.onBeforeReset?.();
    });
    const lastSignalingErrorRef = { current: null as Record<string, unknown> | null };

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeRef}
          incomingRef={{ current: null }}
          acceptingIncomingCallRef={{ current: null }}
          incomingIceCandidatesRef={{ current: new Map() }}
          pendingIceCandidatesRef={{ current: new Map() }}
          lastSignalingErrorRef={lastSignalingErrorRef}
          resetCallState={vi.fn()}
          finishCallSession={finishCallSession}
          handleRemoteAnswer={vi.fn(async () => {
            throw new Error("setRemoteDescription failed");
          })}
        />
      );
    });

    const handlers = signalRuntimeMocks.subscriptionState.handlers as {
      onAnswered: (message: Record<string, unknown>) => void;
    };

    await act(async () => {
      handlers.onAnswered({
        type: "call.answered",
        callId: "call-1",
        answererUserId: "peer-1",
        answererDeviceId: "device-1",
        sdp: "answer-sdp",
        mediaEncryption: {
          selectedMode: "frame-v1",
          supportedModes: ["frame-v1", "transport"],
        },
        features: {
          renegotiationV1: true,
        },
      });
      await Promise.resolve();
    });

    expect(lastSignalingErrorRef.current).toEqual(expect.objectContaining({
      code: "ASYNC_SIGNAL_HANDLER_FAILED",
      callId: "call-1",
      signalType: "call.answered",
      errorMessage: "setRemoteDescription failed",
    }));
    expect(finishCallSession).toHaveBeenCalledWith({
      reason: "signal-handler-failed",
      authority: "hangup",
      callId: "call-1",
      notice: { kind: "error", message: "call.error.unableStart" },
    });
  });

  it("ignores stale async handler failures after the call context is already gone", async () => {
    const activeRef = {
      current: {
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
        duration: 0,
        signalingVerified: true,
        e2eeActive: true,
        verificationCode: null,
        verificationHash: null,
        verificationError: null,
        mediaEncryptionMode: "frame-v1",
        peerSupportsRenegotiationV1: true,
      },
    } as MutableRefObject<ActiveCall | null>;
    const resetCallState = vi.fn();
    const lastSignalingErrorRef = { current: null as Record<string, unknown> | null };
    let rejectOffer: ((reason?: unknown) => void) | null = null;

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeRef}
          incomingRef={{ current: null }}
          acceptingIncomingCallRef={{ current: null }}
          incomingIceCandidatesRef={{ current: new Map() }}
          pendingIceCandidatesRef={{ current: new Map() }}
          lastSignalingErrorRef={lastSignalingErrorRef}
          resetCallState={resetCallState}
          handleIncomingRenegotiationOffer={vi.fn(() => new Promise<void>((_, reject) => {
            rejectOffer = reject;
          }))}
        />
      );
    });

    const handlers = signalRuntimeMocks.subscriptionState.handlers as {
      onRenegotiationOffer: (message: Record<string, unknown>) => void;
    };

    await act(async () => {
      handlers.onRenegotiationOffer({
        type: "call.renegotiate.offer",
        callId: "call-1",
        revision: 2,
        senderUserId: "peer-1",
        senderDeviceId: "device-1",
        sdp: "offer-sdp",
      });
      activeRef.current = null;
      rejectOffer?.(new Error("stale renegotiation"));
      await Promise.resolve();
    });

    expect(lastSignalingErrorRef.current).toBeNull();
    expect(resetCallState).not.toHaveBeenCalled();
  });

  it("ignores stale old-session signals after a new call becomes current", async () => {
    const activeRef = {
      current: {
        callId: "call-2",
        peerUserId: "peer-2",
        peerDeviceId: "device-2",
        peerLabel: "Peer Two",
        callType: "video",
        direction: "outbound",
        state: "ringing",
        muted: false,
        videoOff: false,
        screenSharing: false,
        duration: 0,
        signalingVerified: false,
        e2eeActive: false,
        verificationCode: null,
        verificationHash: null,
        verificationError: null,
        mediaEncryptionMode: "transport",
        peerSupportsRenegotiationV1: false,
      },
    } as MutableRefObject<ActiveCall | null>;
    const pendingIceCandidatesRef = {
      current: new Map<string, RTCIceCandidateInit[]>(),
    } as MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
    const finishCallSession = vi.fn((opts: DirectCallFinishSessionOptions) => {
      opts.onBeforeReset?.();
    });
    const handleRemoteAnswer = vi.fn(async () => undefined);
    const peerConnectionRef = {
      current: {
        remoteDescription: null,
        addIceCandidate: vi.fn(async () => undefined),
      } as unknown as RTCPeerConnection,
    } as MutableRefObject<RTCPeerConnection | null>;

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeRef}
          incomingRef={{ current: null }}
          acceptingIncomingCallRef={{ current: null }}
          peerConnectionRef={peerConnectionRef}
          incomingIceCandidatesRef={{ current: new Map() }}
          pendingIceCandidatesRef={pendingIceCandidatesRef}
          finishCallSession={finishCallSession}
          handleRemoteAnswer={handleRemoteAnswer}
        />
      );
    });

    const handlers = signalRuntimeMocks.subscriptionState.handlers as {
      onHangup: (callId: string) => void;
      onIceCandidate: (callId: string, candidate: RTCIceCandidateInit) => void;
      onAnswered: (message: Record<string, unknown>) => void;
    };

    await act(async () => {
      handlers.onHangup("call-1");
      handlers.onIceCandidate("call-1", {
        candidate: "candidate:stale",
        sdpMid: "0",
      });
      handlers.onIceCandidate("call-2", {
        candidate: "candidate:current",
        sdpMid: "1",
      });
      handlers.onAnswered({
        type: "call.answered",
        callId: "call-1",
        answererUserId: "peer-1",
        answererDeviceId: "device-1",
        sdp: "answer-stale",
        mediaEncryption: {
          selectedMode: "transport",
          supportedModes: ["transport"],
        },
        features: {
          renegotiationV1: true,
        },
      });
      handlers.onAnswered({
        type: "call.answered",
        callId: "call-2",
        answererUserId: "peer-2",
        answererDeviceId: "device-2",
        sdp: "answer-current",
        mediaEncryption: {
          selectedMode: "transport",
          supportedModes: ["transport"],
        },
        features: {
          renegotiationV1: true,
        },
      });
      await Promise.resolve();
    });

    expect(finishCallSession).not.toHaveBeenCalled();
    expect(handleRemoteAnswer).toHaveBeenCalledTimes(1);
    expect(handleRemoteAnswer).toHaveBeenCalledWith(expect.objectContaining({
      callId: "call-2",
      sdp: "answer-current",
    }));
    expect(pendingIceCandidatesRef.current.get("call-2")).toEqual([
      { candidate: "candidate:current", sdpMid: "1" },
    ]);
  });
});

// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDirectCallSignalOutcomeHandlers } from "@/calls/direct/runtime/signal/useDirectCallSignalOutcomeHandlers";
import type { ActiveCall, CallNotice, IncomingCall } from "@/calls/direct/model/direct-call-types";
import type { DirectCallErrorSignal } from "@/calls/direct/runtime/signal/direct-call-signal-dispatch";
import type { DirectCallFinishSessionOptions } from "@/calls/direct/runtime/direct-call-runtime-types";

type OutcomeHandlers = ReturnType<typeof useDirectCallSignalOutcomeHandlers>;

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

function HookHarness(props: {
  activeRef: MutableRefObject<ActiveCall | null>;
  incomingRef: MutableRefObject<IncomingCall | null>;
  acceptingIncomingCallRef?: MutableRefObject<IncomingCall | null>;
  renegotiationUnsupportedRef: MutableRefObject<boolean>;
  supportsPeerRenegotiationV1Ref: MutableRefObject<boolean>;
  lastSignalingErrorRef: MutableRefObject<Record<string, unknown> | null>;
  lastRenegotiationAttemptRef: MutableRefObject<Record<string, unknown> | null>;
  setActive: (next: ActiveCall | null | ((prev: ActiveCall | null) => ActiveCall | null)) => void;
  setIncoming: (next: IncomingCall | null | ((prev: IncomingCall | null) => IncomingCall | null)) => void;
  setIsMinimized: (next: boolean | ((prev: boolean) => boolean)) => void;
  resetMinimizedDockState: () => void;
  resetCallState: (opts?: { sendHangup?: boolean; notice?: CallNotice }) => void;
  finishCallSession?: (opts: DirectCallFinishSessionOptions) => void;
  pushNotice: (next: CallNotice, timeoutMs?: number) => void;
  recordCallEvent: (params: {
    userId: string;
    fallbackLabel?: string;
    mode: "audio" | "video";
    direction: "inbound" | "outbound";
    outcome: "ended" | "declined" | "missed";
    durationSec?: number;
  }) => void;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  incomingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
  capture: (handlers: OutcomeHandlers) => void;
}) {
  const handlers = useDirectCallSignalOutcomeHandlers({
    activeRef: props.activeRef,
    incomingRef: props.incomingRef,
    acceptingIncomingCallRef: props.acceptingIncomingCallRef ?? { current: null },
    renegotiationUnsupportedRef: props.renegotiationUnsupportedRef,
    supportsPeerRenegotiationV1Ref: props.supportsPeerRenegotiationV1Ref,
    lastSignalingErrorRef: props.lastSignalingErrorRef,
    lastRenegotiationAttemptRef: props.lastRenegotiationAttemptRef,
    callChatKindRef: { current: null },
    setActive: props.setActive,
    finishCallSession: props.finishCallSession ?? vi.fn((opts: DirectCallFinishSessionOptions) => {
      opts.onBeforeReset?.();
    }),
    pushNotice: props.pushNotice,
    recordCallEvent: props.recordCallEvent,
    debugCallMedia: props.debugCallMedia,
    t: (key: string) => key,
  });

  props.capture(handlers);
  return null;
}

describe("useDirectCallSignalOutcomeHandlers", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("records and resets active call when remote hangup arrives", () => {
    const activeState = {
      current: {
        callId: "call-1",
        peerUserId: "peer-1",
        peerDeviceId: "device-1",
        peerLabel: "Seclettr Peer",
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
      } satisfies ActiveCall,
    };
    const incomingState = { current: null as IncomingCall | null };
    const minimizedState = { current: false };
    const activeRef = activeState as MutableRefObject<ActiveCall | null>;
    const incomingRef = incomingState as MutableRefObject<IncomingCall | null>;
    const setActive = createStateDispatch(activeRef, activeState);
    const setIncoming = createStateDispatch(incomingRef, incomingState);
    const setIsMinimized = createStateDispatch(
      minimizedState as MutableRefObject<boolean>,
      minimizedState
    );
    const finishCallSession = vi.fn((opts: DirectCallFinishSessionOptions) => {
      opts.onBeforeReset?.();
    });
    const pushNotice = vi.fn();
    const recordCallEvent = vi.fn();
    const resetMinimizedDockState = vi.fn();
    const debugCallMedia = vi.fn();
    const handlersRef = { current: null as OutcomeHandlers | null };

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeRef}
          incomingRef={incomingRef}
          renegotiationUnsupportedRef={{ current: false }}
          supportsPeerRenegotiationV1Ref={{ current: true }}
          lastSignalingErrorRef={{ current: null }}
          lastRenegotiationAttemptRef={{ current: null }}
          setActive={setActive}
          setIncoming={setIncoming}
          setIsMinimized={setIsMinimized}
          resetMinimizedDockState={resetMinimizedDockState}
          resetCallState={vi.fn()}
          finishCallSession={finishCallSession}
          pushNotice={pushNotice}
          recordCallEvent={recordCallEvent}
          debugCallMedia={debugCallMedia}
          incomingIceCandidatesRef={{ current: new Map() }}
          capture={(handlers) => {
            handlersRef.current = handlers;
          }}
        />
      );
    });

    act(() => {
      handlersRef.current?.handleIncomingHangupSignal("call-1");
    });

    expect(recordCallEvent).toHaveBeenCalledWith({
      userId: "peer-1",
      fallbackLabel: "Seclettr Peer",
      mode: "video",
      direction: "outbound",
      outcome: "ended",
      durationSec: 42,
    });
    expect(finishCallSession).toHaveBeenCalledWith(expect.objectContaining({
      reason: "remote-hangup",
      callId: "call-1",
      notice: { kind: "info", message: "call.notice.ended" },
      onBeforeReset: expect.any(Function),
    }));
    expect(pushNotice).not.toHaveBeenCalled();
  });

  it("clears incoming call state and shows cancellation notice on incoming hangup", () => {
    const activeState = { current: null as ActiveCall | null };
    const incomingState = {
      current: {
        callId: "call-2",
        callerUserId: "peer-2",
        callerDeviceId: "device-2",
        callerLabel: "Seclettr Caller",
        callType: "audio",
        targetUserId: "me",
        offerSdp: "offer-sdp",
        mediaEncryptionOffer: {
          preferredMode: "transport",
          supportedModes: ["transport"] as const,
        },
        supportsRenegotiationV1: true,
      } satisfies IncomingCall,
    };
    const minimizedState = { current: true };
    const activeRef = activeState as MutableRefObject<ActiveCall | null>;
    const incomingRef = incomingState as MutableRefObject<IncomingCall | null>;
    const setActive = createStateDispatch(activeRef, activeState);
    const setIncoming = createStateDispatch(incomingRef, incomingState);
    const setIsMinimized = createStateDispatch(
      minimizedState as MutableRefObject<boolean>,
      minimizedState
    );
    const finishCallSession = vi.fn((opts: DirectCallFinishSessionOptions) => {
      opts.onBeforeReset?.();
    });
    const pushNotice = vi.fn();
    const recordCallEvent = vi.fn();
    const resetMinimizedDockState = vi.fn();
    const debugCallMedia = vi.fn();
    const incomingIceCandidatesRef = {
      current: new Map<string, RTCIceCandidateInit[]>([
        ["call-2", [{ candidate: "candidate-a" }]],
      ]),
    } as MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
    const handlersRef = { current: null as OutcomeHandlers | null };

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeRef}
          incomingRef={incomingRef}
          renegotiationUnsupportedRef={{ current: false }}
          supportsPeerRenegotiationV1Ref={{ current: true }}
          lastSignalingErrorRef={{ current: null }}
          lastRenegotiationAttemptRef={{ current: null }}
          setActive={setActive}
          setIncoming={setIncoming}
          setIsMinimized={setIsMinimized}
          resetMinimizedDockState={resetMinimizedDockState}
          resetCallState={vi.fn()}
          finishCallSession={finishCallSession}
          pushNotice={pushNotice}
          recordCallEvent={recordCallEvent}
          debugCallMedia={debugCallMedia}
          incomingIceCandidatesRef={incomingIceCandidatesRef}
          capture={(handlers) => {
            handlersRef.current = handlers;
          }}
        />
      );
    });

    act(() => {
      handlersRef.current?.handleIncomingHangupSignal("call-2");
    });

    expect(recordCallEvent).toHaveBeenCalledWith({
      userId: "peer-2",
      fallbackLabel: "Seclettr Caller",
      mode: "audio",
      direction: "inbound",
      outcome: "missed",
    });
    expect(finishCallSession).toHaveBeenCalledWith(expect.objectContaining({
      reason: "incoming-cancelled",
      callId: "call-2",
      notice: { kind: "info", message: "call.notice.incomingCancelled" },
      onBeforeReset: expect.any(Function),
    }));
    expect(pushNotice).not.toHaveBeenCalled();
  });

  it("aborts an accept-in-progress session when remote hangup arrives before active state exists", () => {
    const activeState = { current: null as ActiveCall | null };
    const incomingState = { current: null as IncomingCall | null };
    const acceptingIncomingCallRef = {
      current: {
        callId: "call-accepting",
        callerUserId: "peer-accepting",
        callerDeviceId: "device-accepting",
        callerLabel: "Accepting Peer",
        callType: "video",
        targetUserId: "me",
        offerSdp: "offer-sdp",
        mediaEncryptionOffer: {
          preferredMode: "transport",
          supportedModes: ["transport"] as const,
        },
        supportsRenegotiationV1: true,
      } satisfies IncomingCall,
    } as MutableRefObject<IncomingCall | null>;
    const activeRef = activeState as MutableRefObject<ActiveCall | null>;
    const incomingRef = incomingState as MutableRefObject<IncomingCall | null>;
    const finishCallSession = vi.fn((opts: DirectCallFinishSessionOptions) => {
      opts.onBeforeReset?.();
    });
    const handlersRef = { current: null as OutcomeHandlers | null };

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeRef}
          incomingRef={incomingRef}
          acceptingIncomingCallRef={acceptingIncomingCallRef}
          renegotiationUnsupportedRef={{ current: false }}
          supportsPeerRenegotiationV1Ref={{ current: true }}
          lastSignalingErrorRef={{ current: null }}
          lastRenegotiationAttemptRef={{ current: null }}
          setActive={vi.fn()}
          setIncoming={vi.fn()}
          setIsMinimized={vi.fn()}
          resetMinimizedDockState={vi.fn()}
          resetCallState={vi.fn()}
          finishCallSession={finishCallSession}
          pushNotice={vi.fn()}
          recordCallEvent={vi.fn()}
          debugCallMedia={vi.fn()}
          incomingIceCandidatesRef={{ current: new Map() }}
          capture={(handlers) => {
            handlersRef.current = handlers;
          }}
        />
      );
    });

    act(() => {
      handlersRef.current?.handleIncomingHangupSignal("call-accepting");
    });

    expect(finishCallSession).toHaveBeenCalledWith(expect.objectContaining({
      reason: "incoming-cancelled",
      callId: "call-accepting",
      notice: { kind: "info", message: "call.notice.incomingCancelled" },
    }));
  });

  it("marks peer renegotiation as unsupported and pushes notice on unsupported error", () => {
    const activeState = {
      current: {
        callId: "call-3",
        peerUserId: "peer-3",
        peerDeviceId: "device-3",
        peerLabel: "Seclettr Three",
        callType: "video",
        direction: "outbound",
        state: "active",
        muted: false,
        videoOff: false,
        screenSharing: false,
        duration: 3,
        signalingVerified: true,
        e2eeActive: true,
        verificationCode: null,
        verificationHash: null,
        verificationError: null,
        mediaEncryptionMode: "transport",
        peerSupportsRenegotiationV1: true,
      } satisfies ActiveCall,
    };
    const incomingState = { current: null as IncomingCall | null };
    const minimizedState = { current: false };
    const activeRef = activeState as MutableRefObject<ActiveCall | null>;
    const incomingRef = incomingState as MutableRefObject<IncomingCall | null>;
    const setActive = createStateDispatch(activeRef, activeState);
    const setIncoming = createStateDispatch(incomingRef, incomingState);
    const setIsMinimized = createStateDispatch(
      minimizedState as MutableRefObject<boolean>,
      minimizedState
    );
    const finishCallSession = vi.fn((opts: DirectCallFinishSessionOptions) => {
      opts.onBeforeReset?.();
    });
    const pushNotice = vi.fn();
    const recordCallEvent = vi.fn();
    const resetMinimizedDockState = vi.fn();
    const debugCallMedia = vi.fn();
    const renegotiationUnsupportedRef = { current: false };
    const supportsPeerRenegotiationV1Ref = { current: true };
    const lastSignalingErrorRef = { current: null as Record<string, unknown> | null };
    const lastRenegotiationAttemptRef = {
      current: { reason: "screen-on", stage: "sent", revision: 2 } as Record<string, unknown>,
    };
    const handlersRef = { current: null as OutcomeHandlers | null };

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeRef}
          incomingRef={incomingRef}
          renegotiationUnsupportedRef={renegotiationUnsupportedRef}
          supportsPeerRenegotiationV1Ref={supportsPeerRenegotiationV1Ref}
          lastSignalingErrorRef={lastSignalingErrorRef}
          lastRenegotiationAttemptRef={lastRenegotiationAttemptRef}
          setActive={setActive}
          setIncoming={setIncoming}
          setIsMinimized={setIsMinimized}
          resetMinimizedDockState={resetMinimizedDockState}
          resetCallState={vi.fn()}
          finishCallSession={finishCallSession}
          pushNotice={pushNotice}
          recordCallEvent={recordCallEvent}
          debugCallMedia={debugCallMedia}
          incomingIceCandidatesRef={{ current: new Map() }}
          capture={(handlers) => {
            handlersRef.current = handlers;
          }}
        />
      );
    });

    act(() => {
      handlersRef.current?.handleCallErrorSignal({
        type: "error",
        code: "CALL_RENEGOTIATION_UNSUPPORTED",
        message: "unsupported",
      } satisfies DirectCallErrorSignal);
    });

    expect(debugCallMedia).toHaveBeenCalledWith("ws-error", expect.objectContaining({
      code: "CALL_RENEGOTIATION_UNSUPPORTED",
      message: "unsupported",
      activeCallId: "call-3",
      activeScreenSharing: false,
      pendingRenegotiationReason: "screen-on",
      pendingRenegotiationStage: "sent",
      pendingRenegotiationRevision: 2,
    }));
    expect(renegotiationUnsupportedRef.current).toBe(true);
    expect(supportsPeerRenegotiationV1Ref.current).toBe(false);
    expect(activeState.current?.peerSupportsRenegotiationV1).toBe(false);
    expect(lastSignalingErrorRef.current).toEqual(expect.objectContaining({
      code: "CALL_RENEGOTIATION_UNSUPPORTED",
      message: "unsupported",
      activeCallId: "call-3",
      pendingRenegotiationReason: "screen-on",
    }));
    expect(pushNotice).toHaveBeenCalledWith({
      kind: "info",
      message: "Peer does not support in-call video/screen renegotiation. Reload both tabs.",
    });
  });

  it("shows screen-share auth notice and stores diagnostics on invalid call auth", () => {
    const activeState = {
      current: {
        callId: "call-3b",
        peerUserId: "peer-3b",
        peerDeviceId: "device-3b",
        peerLabel: "Seclettr Three B",
        callType: "video",
        direction: "outbound",
        state: "active",
        muted: false,
        videoOff: false,
        screenSharing: true,
        duration: 5,
        signalingVerified: true,
        e2eeActive: true,
        verificationCode: null,
        verificationHash: null,
        verificationError: null,
        mediaEncryptionMode: "transport",
        peerSupportsRenegotiationV1: true,
      } satisfies ActiveCall,
    };
    const incomingState = { current: null as IncomingCall | null };
    const minimizedState = { current: false };
    const activeRef = activeState as MutableRefObject<ActiveCall | null>;
    const incomingRef = incomingState as MutableRefObject<IncomingCall | null>;
    const setActive = createStateDispatch(activeRef, activeState);
    const setIncoming = createStateDispatch(incomingRef, incomingState);
    const setIsMinimized = createStateDispatch(
      minimizedState as MutableRefObject<boolean>,
      minimizedState
    );
    const finishCallSession = vi.fn((opts: DirectCallFinishSessionOptions) => {
      opts.onBeforeReset?.();
    });
    const pushNotice = vi.fn();
    const recordCallEvent = vi.fn();
    const resetMinimizedDockState = vi.fn();
    const debugCallMedia = vi.fn();
    const handlersRef = { current: null as OutcomeHandlers | null };
    const lastSignalingErrorRef = { current: null as Record<string, unknown> | null };
    const lastRenegotiationAttemptRef = {
      current: { reason: "screen-on", stage: "sent", revision: 4 } as Record<string, unknown>,
    };

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeRef}
          incomingRef={incomingRef}
          renegotiationUnsupportedRef={{ current: false }}
          supportsPeerRenegotiationV1Ref={{ current: true }}
          lastSignalingErrorRef={lastSignalingErrorRef}
          lastRenegotiationAttemptRef={lastRenegotiationAttemptRef}
          setActive={setActive}
          setIncoming={setIncoming}
          setIsMinimized={setIsMinimized}
          resetMinimizedDockState={resetMinimizedDockState}
          resetCallState={vi.fn()}
          finishCallSession={finishCallSession}
          pushNotice={pushNotice}
          recordCallEvent={recordCallEvent}
          debugCallMedia={debugCallMedia}
          incomingIceCandidatesRef={{ current: new Map() }}
          capture={(handlers) => {
            handlersRef.current = handlers;
          }}
        />
      );
    });

    act(() => {
      handlersRef.current?.handleCallErrorSignal({
        type: "error",
        code: "INVALID_CALL_AUTH",
        message: "Invalid or missing call auth proof",
        reason: "context_mismatch",
      } satisfies DirectCallErrorSignal);
    });

    expect(debugCallMedia).toHaveBeenCalledWith("ws-error", expect.objectContaining({
      code: "INVALID_CALL_AUTH",
      message: "Invalid or missing call auth proof",
      reason: "context_mismatch",
      activeCallId: "call-3b",
      activeScreenSharing: true,
      pendingRenegotiationReason: "screen-on",
      pendingRenegotiationStage: "sent",
      pendingRenegotiationRevision: 4,
    }));
    expect(lastSignalingErrorRef.current).toEqual(expect.objectContaining({
      code: "INVALID_CALL_AUTH",
      message: "Invalid or missing call auth proof",
      reason: "context_mismatch",
      activeCallId: "call-3b",
      pendingRenegotiationReason: "screen-on",
    }));
    expect(pushNotice).toHaveBeenCalledWith({
      kind: "error",
      message: "call.notice.invalidCallAuthScreenShare",
    });
    expect(finishCallSession).not.toHaveBeenCalled();
  });

  it("uses structured INVALID_CALL_AUTH reasons for user-facing notices", () => {
    const activeState = {
      current: {
        callId: "call-3c",
        peerUserId: "peer-3c",
        peerDeviceId: "device-3c",
        peerLabel: "Seclettr Three C",
        callType: "audio",
        direction: "outbound",
        state: "active",
        muted: false,
        videoOff: true,
        screenSharing: false,
        duration: 1,
        signalingVerified: true,
        e2eeActive: true,
        verificationCode: null,
        verificationHash: null,
        verificationError: null,
        mediaEncryptionMode: "transport",
        peerSupportsRenegotiationV1: true,
      } satisfies ActiveCall,
    };
    const activeRef = activeState as MutableRefObject<ActiveCall | null>;
    const incomingRef = { current: null as IncomingCall | null };
    const setActive = createStateDispatch(activeRef, activeState);
    const setIncoming = createStateDispatch(incomingRef, incomingRef);
    const setIsMinimized = vi.fn();
    const finishCallSession = vi.fn((opts: DirectCallFinishSessionOptions) => {
      opts.onBeforeReset?.();
    });
    const pushNotice = vi.fn();
    const recordCallEvent = vi.fn();
    const resetMinimizedDockState = vi.fn();
    const debugCallMedia = vi.fn();
    const handlersRef = { current: null as OutcomeHandlers | null };

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeRef}
          incomingRef={incomingRef}
          renegotiationUnsupportedRef={{ current: false }}
          supportsPeerRenegotiationV1Ref={{ current: true }}
          lastSignalingErrorRef={{ current: null }}
          lastRenegotiationAttemptRef={{ current: null }}
          setActive={setActive}
          setIncoming={setIncoming}
          setIsMinimized={setIsMinimized}
          resetMinimizedDockState={resetMinimizedDockState}
          resetCallState={vi.fn()}
          finishCallSession={finishCallSession}
          pushNotice={pushNotice}
          recordCallEvent={recordCallEvent}
          debugCallMedia={debugCallMedia}
          incomingIceCandidatesRef={{ current: new Map() }}
          capture={(handlers) => {
            handlersRef.current = handlers;
          }}
        />
      );
    });

    act(() => {
      handlersRef.current?.handleCallErrorSignal({
        type: "error",
        code: "INVALID_CALL_AUTH",
        message: "Call auth proof already used",
        reason: "replayed_call_auth",
      } satisfies DirectCallErrorSignal);
    });

    expect(pushNotice).toHaveBeenCalledWith({
      kind: "error",
      message: "call.notice.invalidCallAuthReplay",
    });
    expect(finishCallSession).not.toHaveBeenCalled();
  });

  it("records declined outcome and resets call on reject signal", () => {
    const activeState = {
      current: {
        callId: "call-4",
        peerUserId: "peer-4",
        peerDeviceId: "device-4",
        peerLabel: "Seclettr Four",
        callType: "audio",
        direction: "outbound",
        state: "ringing",
        muted: false,
        videoOff: true,
        screenSharing: false,
        duration: 0,
        signalingVerified: false,
        e2eeActive: false,
        verificationCode: null,
        verificationHash: null,
        verificationError: null,
        mediaEncryptionMode: "transport",
        peerSupportsRenegotiationV1: false,
      } satisfies ActiveCall,
    };
    const incomingState = { current: null as IncomingCall | null };
    const minimizedState = { current: false };
    const activeRef = activeState as MutableRefObject<ActiveCall | null>;
    const incomingRef = incomingState as MutableRefObject<IncomingCall | null>;
    const setActive = createStateDispatch(activeRef, activeState);
    const setIncoming = createStateDispatch(incomingRef, incomingState);
    const setIsMinimized = createStateDispatch(
      minimizedState as MutableRefObject<boolean>,
      minimizedState
    );
    const finishCallSession = vi.fn((opts: DirectCallFinishSessionOptions) => {
      opts.onBeforeReset?.();
    });
    const pushNotice = vi.fn();
    const recordCallEvent = vi.fn();
    const resetMinimizedDockState = vi.fn();
    const debugCallMedia = vi.fn();
    const handlersRef = { current: null as OutcomeHandlers | null };

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeRef}
          incomingRef={incomingRef}
          renegotiationUnsupportedRef={{ current: false }}
          supportsPeerRenegotiationV1Ref={{ current: true }}
          lastSignalingErrorRef={{ current: null }}
          lastRenegotiationAttemptRef={{ current: null }}
          setActive={setActive}
          setIncoming={setIncoming}
          setIsMinimized={setIsMinimized}
          resetMinimizedDockState={resetMinimizedDockState}
          resetCallState={vi.fn()}
          finishCallSession={finishCallSession}
          pushNotice={pushNotice}
          recordCallEvent={recordCallEvent}
          debugCallMedia={debugCallMedia}
          incomingIceCandidatesRef={{ current: new Map() }}
          capture={(handlers) => {
            handlersRef.current = handlers;
          }}
        />
      );
    });

    act(() => {
      handlersRef.current?.handleCallRejectedSignal("call-4");
    });

    expect(recordCallEvent).toHaveBeenCalledWith({
      userId: "peer-4",
      fallbackLabel: "Seclettr Four",
      mode: "audio",
      direction: "outbound",
      outcome: "declined",
    });
    expect(finishCallSession).toHaveBeenCalledWith(expect.objectContaining({
      reason: "remote-reject",
      callId: "call-4",
      notice: { kind: "info", message: "call.notice.declined" },
      onBeforeReset: expect.any(Function),
    }));
  });
});

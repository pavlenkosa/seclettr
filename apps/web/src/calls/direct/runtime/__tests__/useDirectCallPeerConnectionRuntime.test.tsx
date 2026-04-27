// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveCall, CallNotice } from "@/calls/direct/model/direct-call-types";
import { useDirectCallPeerConnectionRuntime } from "@/calls/direct/runtime/useDirectCallPeerConnectionRuntime";

type PeerConnectionRuntimeApi = ReturnType<typeof useDirectCallPeerConnectionRuntime>;

function createActiveCall(overrides?: Partial<ActiveCall>): ActiveCall {
  return {
    callId: "call-1",
    peerUserId: "peer-1",
    peerDeviceId: "device-1",
    peerLabel: "Peer One",
    callType: "audio",
    direction: "outbound",
    state: "connecting",
    muted: false,
    videoOff: true,
    screenSharing: false,
    duration: 0,
    signalingVerified: true,
    e2eeActive: false,
    verificationCode: null,
    verificationHash: null,
    verificationError: null,
    mediaEncryptionMode: "transport",
    peerSupportsRenegotiationV1: true,
    ...overrides,
  };
}

class FakePeerConnection {
  onicecandidate: ((event: { candidate: { toJSON: () => unknown } | null }) => void) | null = null;
  ontrack: ((event: { receiver: RTCRtpReceiver; transceiver?: RTCRtpTransceiver | null }) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onsignalingstatechange: (() => void) | null = null;
  onicegatheringstatechange: (() => void) | null = null;
  onnegotiationneeded: (() => void) | null = null;
  connectionState: RTCPeerConnectionState = "new";
  iceConnectionState: RTCIceConnectionState = "new";
  signalingState: RTCSignalingState = "stable";
  iceGatheringState: RTCIceGatheringState = "new";
  restartIce = vi.fn();
  close = vi.fn();
}

function HookHarness(props: {
  activeRef: MutableRefObject<ActiveCall | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  disconnectResetTimerRef: MutableRefObject<number | null>;
  disconnectRecoveryAttemptedRef: MutableRefObject<boolean>;
  negotiationReadyRef: MutableRefObject<boolean>;
  renegotiationUnsupportedRef: MutableRefObject<boolean>;
  sendRenegotiationOfferRef: MutableRefObject<((callId: string, reason: string) => Promise<void>) | null>;
  flushPendingRenegotiationOfferRef: MutableRefObject<((callId: string, trigger: string) => Promise<void>) | null>;
  getTurnCredentials: () => Promise<{ username: string; password: string; uris: string[] }>;
  enqueueOutgoingIceCandidate: (callId: string, candidateJson: string) => void;
  flushOutgoingIceBatch: (callId: string) => void;
  ingestRemoteReceiverTrack: (
    callId: string,
    receiver: RTCRtpReceiver,
    transceiver?: RTCRtpTransceiver | null
  ) => void;
  isCurrentActiveCallContext: (callId: string, pc?: RTCPeerConnection | null) => boolean;
  setActiveIfCurrent: (callId: string, update: (current: ActiveCall) => ActiveCall) => void;
  resetCallStateIfCurrent: (
    callId: string,
    opts?: { sendHangup?: boolean; notice?: CallNotice },
    pc?: RTCPeerConnection | null
  ) => boolean;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  capture: (runtime: PeerConnectionRuntimeApi) => void;
}) {
  const runtime = useDirectCallPeerConnectionRuntime({
    activeRef: props.activeRef,
    peerConnectionRef: props.peerConnectionRef,
    disconnectResetTimerRef: props.disconnectResetTimerRef,
    disconnectRecoveryAttemptedRef: props.disconnectRecoveryAttemptedRef,
    negotiationReadyRef: props.negotiationReadyRef,
    renegotiationUnsupportedRef: props.renegotiationUnsupportedRef,
    sendRenegotiationOfferRef: props.sendRenegotiationOfferRef,
    flushPendingRenegotiationOfferRef: props.flushPendingRenegotiationOfferRef,
    getTurnCredentials: props.getTurnCredentials,
    enqueueOutgoingIceCandidate: props.enqueueOutgoingIceCandidate,
    flushOutgoingIceBatch: props.flushOutgoingIceBatch,
    ingestRemoteReceiverTrack: props.ingestRemoteReceiverTrack,
    isCurrentActiveCallContext: props.isCurrentActiveCallContext,
    setActiveIfCurrent: props.setActiveIfCurrent,
    resetCallStateIfCurrent: props.resetCallStateIfCurrent,
    debugCallMedia: props.debugCallMedia,
    t: (key: string) => key,
  });

  props.capture(runtime);
  return null;
}

describe("useDirectCallPeerConnectionRuntime", () => {
  let container: HTMLDivElement;
  let root: Root;
  let runtime: PeerConnectionRuntimeApi | null;
  let fakePc: FakePeerConnection;
  const originalPeerConnection = globalThis.RTCPeerConnection;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    runtime = null;
    fakePc = new FakePeerConnection();
    vi.useFakeTimers();
    vi.stubGlobal("RTCPeerConnection", vi.fn(() => fakePc));
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    globalThis.RTCPeerConnection = originalPeerConnection;
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("tracks inbound receivers and flushes ICE candidates through the runtime boundary", async () => {
    const activeState = { current: createActiveCall() } as MutableRefObject<ActiveCall | null>;
    const peerConnectionRef = { current: null } as MutableRefObject<RTCPeerConnection | null>;
    const enqueueOutgoingIceCandidate = vi.fn();
    const flushOutgoingIceBatch = vi.fn();
    const ingestRemoteReceiverTrack = vi.fn();

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeState}
          peerConnectionRef={peerConnectionRef}
          disconnectResetTimerRef={{ current: null }}
          disconnectRecoveryAttemptedRef={{ current: false }}
          negotiationReadyRef={{ current: false }}
          renegotiationUnsupportedRef={{ current: false }}
          sendRenegotiationOfferRef={{ current: null }}
          flushPendingRenegotiationOfferRef={{ current: null }}
          getTurnCredentials={async () => ({
            username: "turn-user",
            password: "turn-pass",
            uris: ["turn:turn.example.test"],
          })}
          enqueueOutgoingIceCandidate={enqueueOutgoingIceCandidate}
          flushOutgoingIceBatch={flushOutgoingIceBatch}
          ingestRemoteReceiverTrack={ingestRemoteReceiverTrack}
          isCurrentActiveCallContext={() => true}
          setActiveIfCurrent={vi.fn()}
          resetCallStateIfCurrent={vi.fn(() => true)}
          debugCallMedia={() => undefined}
          capture={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      );
    });

    if (!runtime) {
      throw new Error("Expected peer connection runtime");
    }

    await act(async () => {
      const pc = await runtime?.createPeerConnection("call-1");
      peerConnectionRef.current = pc ?? null;
    });

    const receiver = { track: { kind: "audio" } } as unknown as RTCRtpReceiver;
    const transceiver = { mid: "0" } as unknown as RTCRtpTransceiver;
    act(() => {
      fakePc.ontrack?.({ receiver, transceiver });
      fakePc.onicecandidate?.({
        candidate: {
          toJSON: () => ({ candidate: "candidate:1" }),
        },
      });
      fakePc.onicecandidate?.({ candidate: null });
    });

    expect(ingestRemoteReceiverTrack).toHaveBeenCalledWith("call-1", receiver, transceiver);
    expect(enqueueOutgoingIceCandidate).toHaveBeenCalledWith("call-1", JSON.stringify({ candidate: "candidate:1" }));
    expect(flushOutgoingIceBatch).toHaveBeenCalledWith("call-1");
  });

  it("promotes connected state, starts duration clock, and attempts disconnect recovery once", async () => {
    const activeState = { current: createActiveCall() } as MutableRefObject<ActiveCall | null>;
    const peerConnectionRef = { current: null } as MutableRefObject<RTCPeerConnection | null>;
    const disconnectRecoveryAttemptedRef = { current: false } as MutableRefObject<boolean>;
    const sendRenegotiationOffer = vi.fn(async () => undefined);
    const setActiveIfCurrent = vi.fn((callId: string, update: (current: ActiveCall) => ActiveCall) => {
      if (activeState.current?.callId !== callId) return;
      activeState.current = update(activeState.current);
    });
    const resetCallStateIfCurrent = vi.fn(() => true);

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeState}
          peerConnectionRef={peerConnectionRef}
          disconnectResetTimerRef={{ current: null }}
          disconnectRecoveryAttemptedRef={disconnectRecoveryAttemptedRef}
          negotiationReadyRef={{ current: true }}
          renegotiationUnsupportedRef={{ current: false }}
          sendRenegotiationOfferRef={{ current: sendRenegotiationOffer }}
          flushPendingRenegotiationOfferRef={{ current: null }}
          getTurnCredentials={async () => ({
            username: "turn-user",
            password: "turn-pass",
            uris: ["turn:turn.example.test"],
          })}
          enqueueOutgoingIceCandidate={vi.fn()}
          flushOutgoingIceBatch={vi.fn()}
          ingestRemoteReceiverTrack={vi.fn()}
          isCurrentActiveCallContext={() => true}
          setActiveIfCurrent={setActiveIfCurrent}
          resetCallStateIfCurrent={resetCallStateIfCurrent}
          debugCallMedia={() => undefined}
          capture={(nextRuntime) => {
            runtime = nextRuntime;
          }}
        />
      );
    });

    if (!runtime) {
      throw new Error("Expected peer connection runtime");
    }

    await act(async () => {
      const pc = await runtime?.createPeerConnection("call-1");
      peerConnectionRef.current = pc ?? null;
    });

    act(() => {
      fakePc.connectionState = "connected";
      fakePc.onconnectionstatechange?.();
    });

    expect(activeState.current?.state).toBe("active");
    expect(activeState.current?.duration).toBe(0);
    expect(activeState.current?.durationStartedAtMs).toEqual(expect.any(Number));

    act(() => {
      fakePc.connectionState = "disconnected";
      fakePc.onconnectionstatechange?.();
    });

    expect(fakePc.restartIce).toHaveBeenCalledTimes(1);
    expect(sendRenegotiationOffer).toHaveBeenCalledWith("call-1", "disconnect-recovery");
    expect(disconnectRecoveryAttemptedRef.current).toBe(true);

    act(() => {
      fakePc.connectionState = "failed";
      fakePc.onconnectionstatechange?.();
    });

    expect(resetCallStateIfCurrent).toHaveBeenCalledWith(
      "call-1",
      expect.objectContaining({
        notice: expect.objectContaining({ kind: "error" }),
      }),
      fakePc
    );
  });
});

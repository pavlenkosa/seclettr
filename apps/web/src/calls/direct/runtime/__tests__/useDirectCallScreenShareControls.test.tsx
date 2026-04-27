// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveCall } from "@/calls/direct/model/direct-call-types";
import { useDirectCallScreenShareControls } from "@/calls/direct/runtime/useDirectCallScreenShareControls";

type ScreenShareControlsApi = ReturnType<typeof useDirectCallScreenShareControls>;
type ScreenShareControlsOptions = Parameters<typeof useDirectCallScreenShareControls>[0];
type ScreenShareControlsPushNotice = ScreenShareControlsOptions["pushNotice"];
type ScreenShareControlsSendCallMediaState = ScreenShareControlsOptions["sendCallMediaState"];

function createActiveCall(overrides?: Partial<ActiveCall>): ActiveCall {
  return {
    callId: "call-1",
    peerUserId: "peer-1",
    peerDeviceId: "device-1",
    peerLabel: "Peer",
    callType: "audio",
    direction: "outbound",
    state: "active",
    muted: false,
    videoOff: true,
    screenSharing: false,
    duration: 0,
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

function HookHarness(props: {
  activeRef: MutableRefObject<ActiveCall | null>;
  localStreamRef: MutableRefObject<MediaStream | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  cameraSenderRef: MutableRefObject<RTCRtpSender | null>;
  screenShareTrackRef: MutableRefObject<MediaStreamTrack | null>;
  screenShareSenderRef: MutableRefObject<RTCRtpSender | null>;
  screenShareTransceiverRef: MutableRefObject<RTCRtpTransceiver | null>;
  negotiationReadyRef: MutableRefObject<boolean>;
  renegotiationUnsupportedRef: MutableRefObject<boolean>;
  lastSignalingErrorRef: MutableRefObject<Record<string, unknown> | null>;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  recordLastRenegotiationAttempt: (payload: Record<string, unknown>) => void;
  sendRenegotiationOffer: (callId: string, reason: string) => Promise<void>;
  setActiveIfCurrent: (callId: string, update: (current: ActiveCall) => ActiveCall) => void;
  isCurrentActiveCallContext: (callId: string, pc?: RTCPeerConnection | null) => boolean;
  ensureVideoSenders: (pc: RTCPeerConnection) => void;
  syncVisualTransceiverBindings: () => void;
  syncVisualTransceiverDirections: (callId: string) => void;
  syncLocalPreview: () => void;
  syncLocalScreenPreview: (track: MediaStreamTrack | null) => void;
  pushNotice: ScreenShareControlsPushNotice;
  sendCallMediaState: ScreenShareControlsSendCallMediaState;
  syncOutgoingVisualMediaStateTrackBindings: (callId?: string) => void;
  clearOutgoingVisualMediaStateTrackBinding: (source: "camera" | "screen") => void;
  ensureActiveDirectCallSenderFrameCrypto: (callId: string, reason: string) => Promise<boolean>;
  capture: (api: ScreenShareControlsApi) => void;
}) {
  const api = useDirectCallScreenShareControls({
    activeRef: props.activeRef,
    localStreamRef: props.localStreamRef,
    peerConnectionRef: props.peerConnectionRef,
    cameraSenderRef: props.cameraSenderRef,
    screenShareTrackRef: props.screenShareTrackRef,
    screenShareSenderRef: props.screenShareSenderRef,
    screenShareTransceiverRef: props.screenShareTransceiverRef,
    negotiationReadyRef: props.negotiationReadyRef,
    renegotiationUnsupportedRef: props.renegotiationUnsupportedRef,
    lastSignalingErrorRef: props.lastSignalingErrorRef,
    debugCallMedia: props.debugCallMedia,
    recordLastRenegotiationAttempt: props.recordLastRenegotiationAttempt,
    sendRenegotiationOffer: props.sendRenegotiationOffer,
    setActiveIfCurrent: props.setActiveIfCurrent,
    isCurrentActiveCallContext: props.isCurrentActiveCallContext,
    ensureVideoSenders: props.ensureVideoSenders,
    syncVisualTransceiverBindings: props.syncVisualTransceiverBindings,
    syncVisualTransceiverDirections: props.syncVisualTransceiverDirections,
    syncLocalPreview: props.syncLocalPreview,
    syncLocalScreenPreview: props.syncLocalScreenPreview,
    pushNotice: props.pushNotice,
    sendCallMediaState: props.sendCallMediaState,
    syncOutgoingVisualMediaStateTrackBindings: props.syncOutgoingVisualMediaStateTrackBindings,
    clearOutgoingVisualMediaStateTrackBinding: props.clearOutgoingVisualMediaStateTrackBinding,
    t: (key: string) => key,
    ensureActiveDirectCallSenderFrameCrypto: props.ensureActiveDirectCallSenderFrameCrypto,
  });
  props.capture(api);
  return null;
}

describe("useDirectCallScreenShareControls", () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: ScreenShareControlsApi | null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api = null;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("starts screen share and publishes visual state", async () => {
    const activeRef = { current: createActiveCall() } as MutableRefObject<ActiveCall | null>;
    const screenShareTrackRef = { current: null } as MutableRefObject<MediaStreamTrack | null>;
    const displayTrack = { id: "screen-1", stop: vi.fn(), addEventListener: vi.fn() } as unknown as MediaStreamTrack;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getDisplayMedia: vi.fn(async () => ({
          getVideoTracks: () => [displayTrack],
        })),
      },
    });

    const replaceTrack = vi.fn(async () => undefined);
    const setActiveIfCurrent = vi.fn((callId: string, update: (current: ActiveCall) => ActiveCall) => {
      if (activeRef.current?.callId === callId) {
        activeRef.current = update(activeRef.current);
      }
    });
    const sendCallMediaState = vi.fn();
    const sendRenegotiationOffer = vi.fn(async () => undefined);
    const syncLocalScreenPreview = vi.fn();

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeRef}
          localStreamRef={{ current: null }}
          peerConnectionRef={{ current: {} as RTCPeerConnection }}
          cameraSenderRef={{ current: { replaceTrack: vi.fn() } as unknown as RTCRtpSender }}
          screenShareTrackRef={screenShareTrackRef}
          screenShareSenderRef={{ current: { replaceTrack } as unknown as RTCRtpSender }}
          screenShareTransceiverRef={{ current: {} as RTCRtpTransceiver }}
          negotiationReadyRef={{ current: true }}
          renegotiationUnsupportedRef={{ current: false }}
          lastSignalingErrorRef={{ current: null }}
          debugCallMedia={vi.fn()}
          recordLastRenegotiationAttempt={vi.fn()}
          sendRenegotiationOffer={sendRenegotiationOffer}
          setActiveIfCurrent={setActiveIfCurrent}
          isCurrentActiveCallContext={() => true}
          ensureVideoSenders={vi.fn()}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          syncLocalPreview={vi.fn()}
          syncLocalScreenPreview={syncLocalScreenPreview}
          pushNotice={vi.fn()}
          sendCallMediaState={sendCallMediaState}
          syncOutgoingVisualMediaStateTrackBindings={vi.fn()}
          clearOutgoingVisualMediaStateTrackBinding={vi.fn()}
          ensureActiveDirectCallSenderFrameCrypto={vi.fn(async () => true)}
          capture={(value) => {
            api = value;
          }}
        />
      );
    });

    await act(async () => {
      await api?.toggleScreenShare();
    });

    expect(replaceTrack).toHaveBeenCalledWith(displayTrack);
    expect(screenShareTrackRef.current).toBe(displayTrack);
    expect(syncLocalScreenPreview).toHaveBeenCalledWith(displayTrack);
    expect(activeRef.current?.screenSharing).toBe(true);
    expect(activeRef.current?.callType).toBe("video");
    expect(sendCallMediaState).toHaveBeenCalledWith("screen", "on", "call-1", "user-toggle");
    expect(sendRenegotiationOffer).toHaveBeenCalledWith("call-1", "screen-on");
  });

  it("stops screen share and restores non-screen state", async () => {
    const activeRef = { current: createActiveCall({ callType: "video", screenSharing: true }) } as MutableRefObject<ActiveCall | null>;
    const screenTrack = { id: "screen-1", stop: vi.fn() } as unknown as MediaStreamTrack;
    const screenShareTrackRef = { current: screenTrack } as MutableRefObject<MediaStreamTrack | null>;
    const localStreamRef = {
      current: {
        getVideoTracks: () => [],
      } as unknown as MediaStream,
    } as MutableRefObject<MediaStream | null>;
    const replaceTrack = vi.fn(async () => undefined);
    const setActiveIfCurrent = vi.fn((callId: string, update: (current: ActiveCall) => ActiveCall) => {
      if (activeRef.current?.callId === callId) {
        activeRef.current = update(activeRef.current);
      }
    });
    const sendCallMediaState = vi.fn();
    const sendRenegotiationOffer = vi.fn(async () => undefined);
    const syncLocalScreenPreview = vi.fn();

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeRef}
          localStreamRef={localStreamRef}
          peerConnectionRef={{ current: {} as RTCPeerConnection }}
          cameraSenderRef={{ current: { replaceTrack: vi.fn() } as unknown as RTCRtpSender }}
          screenShareTrackRef={screenShareTrackRef}
          screenShareSenderRef={{ current: { replaceTrack } as unknown as RTCRtpSender }}
          screenShareTransceiverRef={{ current: {} as RTCRtpTransceiver }}
          negotiationReadyRef={{ current: true }}
          renegotiationUnsupportedRef={{ current: false }}
          lastSignalingErrorRef={{ current: null }}
          debugCallMedia={vi.fn()}
          recordLastRenegotiationAttempt={vi.fn()}
          sendRenegotiationOffer={sendRenegotiationOffer}
          setActiveIfCurrent={setActiveIfCurrent}
          isCurrentActiveCallContext={() => true}
          ensureVideoSenders={vi.fn()}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          syncLocalPreview={vi.fn()}
          syncLocalScreenPreview={syncLocalScreenPreview}
          pushNotice={vi.fn()}
          sendCallMediaState={sendCallMediaState}
          syncOutgoingVisualMediaStateTrackBindings={vi.fn()}
          clearOutgoingVisualMediaStateTrackBinding={vi.fn()}
          ensureActiveDirectCallSenderFrameCrypto={vi.fn(async () => true)}
          capture={(value) => {
            api = value;
          }}
        />
      );
    });

    await act(async () => {
      await api?.stopScreenShare("user-toggle");
    });

    expect(replaceTrack).toHaveBeenCalledWith(null);
    expect(screenTrack.stop).toHaveBeenCalled();
    expect(syncLocalScreenPreview).toHaveBeenCalledWith(null);
    expect(activeRef.current?.screenSharing).toBe(false);
    expect(activeRef.current?.callType).toBe("audio");
    expect(sendCallMediaState).toHaveBeenCalledWith("screen", "off", "call-1", "user-toggle");
    expect(sendRenegotiationOffer).toHaveBeenCalledWith("call-1", "screen-off");
  });
});

// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveCall } from "@/calls/direct/model/direct-call-types";
import { useDirectCallCameraToggle } from "@/calls/direct/runtime/useDirectCallCameraToggle";

type CameraToggleApi = ReturnType<typeof useDirectCallCameraToggle>;
type CameraToggleOptions = Parameters<typeof useDirectCallCameraToggle>[0];
type CameraTogglePushNotice = CameraToggleOptions["pushNotice"];
type CameraToggleSendCallMediaState = CameraToggleOptions["sendCallMediaState"];

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
  screenShareSenderRef: MutableRefObject<RTCRtpSender | null>;
  negotiationReadyRef: MutableRefObject<boolean>;
  renegotiationUnsupportedRef: MutableRefObject<boolean>;
  pushNotice: CameraTogglePushNotice;
  ensureVideoSenders: (pc: RTCPeerConnection) => void;
  syncVisualTransceiverBindings: () => void;
  syncVisualTransceiverDirections: (callId: string) => void;
  syncLocalPreview: () => void;
  isCurrentActiveCallContext: (callId: string, pc?: RTCPeerConnection | null) => boolean;
  setActiveIfCurrent: (callId: string, update: (current: ActiveCall) => ActiveCall) => void;
  sendCallMediaState: CameraToggleSendCallMediaState;
  syncOutgoingVisualMediaStateTrackBindings: (callId?: string) => void;
  clearOutgoingVisualMediaStateTrackBinding: (source: "camera" | "screen") => void;
  sendRenegotiationOffer: (callId: string, reason: string) => Promise<void>;
  ensureActiveDirectCallSenderFrameCrypto: (callId: string, reason: string) => Promise<boolean>;
  capture: (api: CameraToggleApi) => void;
}) {
  const api = useDirectCallCameraToggle({
    activeRef: props.activeRef,
    localStreamRef: props.localStreamRef,
    peerConnectionRef: props.peerConnectionRef,
    cameraSenderRef: props.cameraSenderRef,
    screenShareSenderRef: props.screenShareSenderRef,
    negotiationReadyRef: props.negotiationReadyRef,
    renegotiationUnsupportedRef: props.renegotiationUnsupportedRef,
    pushNotice: props.pushNotice,
    ensureVideoSenders: props.ensureVideoSenders,
    syncVisualTransceiverBindings: props.syncVisualTransceiverBindings,
    syncVisualTransceiverDirections: props.syncVisualTransceiverDirections,
    syncLocalPreview: props.syncLocalPreview,
    isCurrentActiveCallContext: props.isCurrentActiveCallContext,
    setActiveIfCurrent: props.setActiveIfCurrent,
    sendCallMediaState: props.sendCallMediaState,
    syncOutgoingVisualMediaStateTrackBindings: props.syncOutgoingVisualMediaStateTrackBindings,
    clearOutgoingVisualMediaStateTrackBinding: props.clearOutgoingVisualMediaStateTrackBinding,
    sendRenegotiationOffer: props.sendRenegotiationOffer,
    t: (key: string) => key,
    ensureActiveDirectCallSenderFrameCrypto: props.ensureActiveDirectCallSenderFrameCrypto,
  });
  props.capture(api);
  return null;
}

describe("useDirectCallCameraToggle", () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: CameraToggleApi | null;

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

  it("enables camera, updates active state, and renegotiates", async () => {
    const activeRef = { current: createActiveCall() } as MutableRefObject<ActiveCall | null>;
    const addedTracks: MediaStreamTrack[] = [];
    const localStream = {
      getVideoTracks: vi.fn(() => []),
      addTrack: vi.fn((track: MediaStreamTrack) => {
        addedTracks.push(track);
      }),
    } as unknown as MediaStream;
    const localStreamRef = { current: localStream } as MutableRefObject<MediaStream | null>;
    const peerConnection = {} as RTCPeerConnection;
    const peerConnectionRef = { current: peerConnection } as MutableRefObject<RTCPeerConnection | null>;
    const replaceTrack = vi.fn(async () => undefined);
    const cameraSenderRef = { current: { replaceTrack } as unknown as RTCRtpSender } as MutableRefObject<RTCRtpSender | null>;
    const screenShareSenderRef = { current: { replaceTrack: vi.fn() } as unknown as RTCRtpSender } as MutableRefObject<RTCRtpSender | null>;
    const sendCallMediaState = vi.fn();
    const sendRenegotiationOffer = vi.fn(async () => undefined);
    const setActiveIfCurrent = vi.fn((callId: string, update: (current: ActiveCall) => ActiveCall) => {
      if (activeRef.current?.callId === callId) {
        activeRef.current = update(activeRef.current);
      }
    });
    const nextVideoTrack = { id: "camera-1", stop: vi.fn() } as unknown as MediaStreamTrack;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getVideoTracks: () => [nextVideoTrack],
        })),
      },
    });

    act(() => {
      root.render(
        <HookHarness
          activeRef={activeRef}
          localStreamRef={localStreamRef}
          peerConnectionRef={peerConnectionRef}
          cameraSenderRef={cameraSenderRef}
          screenShareSenderRef={screenShareSenderRef}
          negotiationReadyRef={{ current: true }}
          renegotiationUnsupportedRef={{ current: false }}
          pushNotice={vi.fn()}
          ensureVideoSenders={vi.fn()}
          syncVisualTransceiverBindings={vi.fn()}
          syncVisualTransceiverDirections={vi.fn()}
          syncLocalPreview={vi.fn()}
          isCurrentActiveCallContext={() => true}
          setActiveIfCurrent={setActiveIfCurrent}
          sendCallMediaState={sendCallMediaState}
          syncOutgoingVisualMediaStateTrackBindings={vi.fn()}
          clearOutgoingVisualMediaStateTrackBinding={vi.fn()}
          sendRenegotiationOffer={sendRenegotiationOffer}
          ensureActiveDirectCallSenderFrameCrypto={vi.fn(async () => true)}
          capture={(value) => {
            api = value;
          }}
        />
      );
    });

    await act(async () => {
      await api?.();
    });

    expect(replaceTrack).toHaveBeenCalledWith(nextVideoTrack);
    expect(addedTracks).toEqual([nextVideoTrack]);
    expect(activeRef.current?.videoOff).toBe(false);
    expect(activeRef.current?.callType).toBe("video");
    expect(sendCallMediaState).toHaveBeenCalledWith("camera", "on", "call-1", "user-toggle");
    expect(sendRenegotiationOffer).toHaveBeenCalledWith("call-1", "camera-on");
  });
});

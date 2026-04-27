// @vitest-environment jsdom

import { type MutableRefObject } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveCall } from "@/calls/direct/model/direct-call-types";
import { useDirectCallCameraSwitch } from "@/calls/direct/runtime/useDirectCallCameraSwitch";

type CameraSwitchApi = ReturnType<typeof useDirectCallCameraSwitch>;

function createActiveCall(overrides?: Partial<ActiveCall>): ActiveCall {
  return {
    callId: "call-1",
    peerUserId: "peer-1",
    peerDeviceId: "device-1",
    peerLabel: "Peer",
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
    mediaEncryptionMode: "transport",
    peerSupportsRenegotiationV1: true,
    ...overrides,
  };
}

function HookHarness(props: {
  active: ActiveCall | null;
  activeRef: MutableRefObject<ActiveCall | null>;
  localStreamRef: MutableRefObject<MediaStream | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  cameraSenderRef: MutableRefObject<RTCRtpSender | null>;
  pushNotice: (next: { kind: "info" | "error"; message: string }) => void;
  ensureVideoSenders: (pc: RTCPeerConnection) => void;
  syncVisualTransceiverBindings: () => void;
  syncLocalPreview: () => void;
  isCurrentActiveCallContext: (callId: string, pc?: RTCPeerConnection | null) => boolean;
  syncOutgoingVisualMediaStateTrackBindings: (callId?: string) => void;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  ensureActiveDirectCallSenderFrameCrypto: (callId: string, reason: string) => Promise<boolean>;
  capture: (api: CameraSwitchApi) => void;
}) {
  const api = useDirectCallCameraSwitch({
    active: props.active,
    activeRef: props.activeRef,
    localStreamRef: props.localStreamRef,
    peerConnectionRef: props.peerConnectionRef,
    cameraSenderRef: props.cameraSenderRef,
    pushNotice: props.pushNotice as (next: any, timeoutMs?: number) => void,
    ensureVideoSenders: props.ensureVideoSenders,
    syncVisualTransceiverBindings: props.syncVisualTransceiverBindings,
    syncLocalPreview: props.syncLocalPreview,
    isCurrentActiveCallContext: props.isCurrentActiveCallContext,
    syncOutgoingVisualMediaStateTrackBindings: props.syncOutgoingVisualMediaStateTrackBindings,
    debugCallMedia: props.debugCallMedia,
    t: (key: string) => key,
    ensureActiveDirectCallSenderFrameCrypto: props.ensureActiveDirectCallSenderFrameCrypto,
  });

  props.capture(api);
  return null;
}

describe("useDirectCallCameraSwitch", () => {
  let container: HTMLDivElement;
  let root: Root;
  let api: CameraSwitchApi | null;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("reports availability and replaces the local camera track without renegotiation", async () => {
    const activeRef = { current: createActiveCall() } as MutableRefObject<ActiveCall | null>;
    const currentTrack = {
      id: "front-track",
      label: "Front Camera",
      stop: vi.fn(),
      getSettings: () => ({
        deviceId: "front-camera",
        facingMode: "user",
      }),
    } as unknown as MediaStreamTrack;
    const nextTrack = {
      id: "rear-track",
      label: "Rear Camera",
      stop: vi.fn(),
      getSettings: () => ({
        deviceId: "rear-camera",
        facingMode: "environment",
      }),
    } as unknown as MediaStreamTrack;
    const localStream = {
      getVideoTracks: vi.fn(() => [currentTrack]),
      addTrack: vi.fn(),
      removeTrack: vi.fn(),
    } as unknown as MediaStream;
    const localStreamRef = { current: localStream } as MutableRefObject<MediaStream | null>;
    const peerConnection = {} as RTCPeerConnection;
    const peerConnectionRef = { current: peerConnection } as MutableRefObject<RTCPeerConnection | null>;
    const replaceTrack = vi.fn(async () => undefined);
    const cameraSenderRef = {
      current: { replaceTrack } as unknown as RTCRtpSender,
    } as MutableRefObject<RTCRtpSender | null>;
    const ensureVideoSenders = vi.fn();
    const syncVisualTransceiverBindings = vi.fn();
    const syncLocalPreview = vi.fn();
    const syncOutgoingVisualMediaStateTrackBindings = vi.fn();
    const pushNotice = vi.fn();
    const debugCallMedia = vi.fn();
    const enumerateDevices = vi.fn(async () => ([
      { kind: "videoinput", deviceId: "front-camera", label: "Front Camera" },
      { kind: "videoinput", deviceId: "rear-camera", label: "Rear Camera" },
    ] satisfies Partial<MediaDeviceInfo>[]));
    const getUserMedia = vi.fn(async () => ({
      getVideoTracks: () => [nextTrack],
    }));

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices,
        getUserMedia,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });

    await act(async () => {
      root.render(
        <HookHarness
          active={activeRef.current}
          activeRef={activeRef}
          localStreamRef={localStreamRef}
          peerConnectionRef={peerConnectionRef}
          cameraSenderRef={cameraSenderRef}
          pushNotice={pushNotice}
          ensureVideoSenders={ensureVideoSenders}
          syncVisualTransceiverBindings={syncVisualTransceiverBindings}
          syncLocalPreview={syncLocalPreview}
          isCurrentActiveCallContext={() => true}
          syncOutgoingVisualMediaStateTrackBindings={syncOutgoingVisualMediaStateTrackBindings}
          debugCallMedia={debugCallMedia}
          ensureActiveDirectCallSenderFrameCrypto={vi.fn(async () => true)}
          capture={(value) => {
            api = value;
          }}
        />
      );
    });

    expect(api?.canSwitchCamera).toBe(true);

    await act(async () => {
      await api?.switchCamera();
    });

    expect(ensureVideoSenders).toHaveBeenCalledWith(peerConnection);
    expect(syncVisualTransceiverBindings).toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        deviceId: { exact: "rear-camera" },
      },
    });
    expect(replaceTrack).toHaveBeenCalledWith(nextTrack);
    expect(localStream.removeTrack).toHaveBeenCalledWith(currentTrack);
    expect(currentTrack.stop).toHaveBeenCalled();
    expect(localStream.addTrack).toHaveBeenCalledWith(nextTrack);
    expect(syncLocalPreview).toHaveBeenCalled();
    expect(syncOutgoingVisualMediaStateTrackBindings).toHaveBeenCalledWith("call-1");
    expect(pushNotice).not.toHaveBeenCalled();
  });
});

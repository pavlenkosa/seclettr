import type { MutableRefObject } from "react";
import type {
  CallMediaSource,
  DirectCallVisualMediaSource,
  IncomingMediaStateHint,
  LastIncomingMediaState,
} from "@/calls/direct/model/call-media-state";
import type {
  RemoteMediaSlot,
  RemoteMediaSlotStatus,
  RemoteMediaSource,
  RemoteMediaUiStatus,
} from "@/calls/direct/model/call-media-slots";

export interface UseDirectCallRemoteMediaRuntimeOptions {
  activeCallId: string | null;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  cameraTransceiverRef: MutableRefObject<RTCRtpTransceiver | null>;
  screenShareTransceiverRef: MutableRefObject<RTCRtpTransceiver | null>;
  lastIncomingMediaStateRef: MutableRefObject<
    Record<CallMediaSource, LastIncomingMediaState | null>
  >;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
}

export interface DirectCallRemoteMediaStateResult {
  remoteCameraSlot: RemoteMediaSlot;
  remoteScreenSlot: RemoteMediaSlot;
  remoteVideoReady: boolean;
  remoteScreenReady: boolean;
  remoteCameraUiStatus: RemoteMediaUiStatus;
  remoteScreenUiStatus: RemoteMediaUiStatus;
  remoteVideoRef: MutableRefObject<HTMLVideoElement | null>;
  remoteScreenVideoRef: MutableRefObject<HTMLVideoElement | null>;
  remoteVideoCompanionRef: MutableRefObject<HTMLVideoElement | null>;
  remoteScreenCompanionRef: MutableRefObject<HTMLVideoElement | null>;
  remoteCameraProbeRef: MutableRefObject<HTMLVideoElement | null>;
  remoteScreenProbeRef: MutableRefObject<HTMLVideoElement | null>;
  remoteAudioRef: MutableRefObject<HTMLAudioElement | null>;
  remoteAudioStreamRef: MutableRefObject<MediaStream | null>;
  remoteCameraStreamRef: MutableRefObject<MediaStream | null>;
  remoteScreenStreamRef: MutableRefObject<MediaStream | null>;
  remoteCameraSlotRef: MutableRefObject<RemoteMediaSlot>;
  remoteScreenSlotRef: MutableRefObject<RemoteMediaSlot>;
  remoteReceiverSlotBindingsRef: MutableRefObject<Map<string, DirectCallVisualMediaSource>>;
  remoteReceiverTransceiverBindingsRef: MutableRefObject<WeakMap<RTCRtpTransceiver, DirectCallVisualMediaSource>>;
  remoteTrackLifecycleCleanupRef: MutableRefObject<Map<string, () => void>>;
  pendingReplacementTrackRef: MutableRefObject<Map<RemoteMediaSource, string>>;
  commitRemoteMediaSlot: (
    source: DirectCallVisualMediaSource,
    nextSlot: RemoteMediaSlot
  ) => void;
  updateRemoteMediaSlot: (
    source: DirectCallVisualMediaSource,
    updater: (slot: RemoteMediaSlot) => RemoteMediaSlot
  ) => void;
  resetRemoteMediaRuntime: () => void;
}

export interface DirectCallRemoteTrackIngressOptions extends Pick<
  UseDirectCallRemoteMediaRuntimeOptions,
  | "peerConnectionRef"
  | "cameraTransceiverRef"
  | "screenShareTransceiverRef"
  | "lastIncomingMediaStateRef"
  | "debugCallMedia"
>, Pick<
  DirectCallRemoteMediaStateResult,
  | "remoteCameraSlotRef"
  | "remoteScreenSlotRef"
  | "remoteReceiverSlotBindingsRef"
  | "remoteReceiverTransceiverBindingsRef"
  | "remoteTrackLifecycleCleanupRef"
  | "pendingReplacementTrackRef"
  | "commitRemoteMediaSlot"
  | "updateRemoteMediaSlot"
> {}

export interface DirectCallRemoteTrackIngressResult {
  clearRemoteTrackLifecycleBinding: (trackId: string | null) => void;
  clearRemoteMediaSlot: (
    source: DirectCallVisualMediaSource,
    status?: RemoteMediaSlotStatus,
    expectedTrackId?: string | null
  ) => void;
  resolveRemoteReceiverSlotSource: (
    transceiver: RTCRtpTransceiver | null | undefined
  ) => DirectCallVisualMediaSource;
  bindRemoteVideoTrackLifecycle: (
    source: DirectCallVisualMediaSource,
    track: MediaStreamTrack
  ) => void;
  ingestRemoteVideoTrack: (params: {
    callId: string;
    receiver: RTCRtpReceiver;
    transceiver?: RTCRtpTransceiver | null;
    resolvedSlotSource?: DirectCallVisualMediaSource;
  }) => void;
}

export interface DirectCallRemoteMediaHintsOptions extends Pick<
  UseDirectCallRemoteMediaRuntimeOptions,
  | "debugCallMedia"
>, Pick<
  DirectCallRemoteMediaStateResult,
  | "remoteCameraSlotRef"
  | "remoteScreenSlotRef"
  | "updateRemoteMediaSlot"
>, Pick<
  DirectCallRemoteTrackIngressResult,
  | "clearRemoteMediaSlot"
> {}

export interface DirectCallRemoteMediaHintsResult {
  processIncomingMediaStateHint: (
    source: DirectCallVisualMediaSource,
    hint: IncomingMediaStateHint,
    trackId: string | null,
    trackEnded: boolean
  ) => void;
  updateSlotProgress: (
    source: DirectCallVisualMediaSource,
    progress: { lastFrameAt: number; lastPacketAt: number }
  ) => void;
}

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { CallSecurityMode } from "@/ui-settings";
import type {
  DirectCallMediaEncryptionMode,
  DirectCallMediaEncryptionOffer,
} from "@/calls/direct/model/call-media-encryption-negotiation";
import { type DirectCallNegotiationRole } from "@/calls/direct/model/direct-call-lifecycle";
import type {
  CallMediaSource,
  LastIncomingMediaState,
} from "@/calls/direct/model/call-media-state";
import type { RemoteMediaSlot } from "@/calls/direct/model/call-media-slots";
import type {
  ActiveCall,
  CallNotice,
  IncomingCall,
  RemoteInboundVideoProgress,
} from "@/calls/direct/model/direct-call-types";

// Local utility types — used only within this file's interface definitions.
// Not part of the public API of this contract file; do not import from consumers.
type Translate = (key: string, params?: Record<string, string | number | undefined>) => string;
type PushNotice = (next: CallNotice, timeoutMs?: number) => void;

export type PlaybackRef = MutableRefObject<{
  lastTime: number;
  lastFrameCount: number;
  lastProgressAt: number;
}>;

// ---------------------------------------------------------------------------
// Sub-contexts for UseDirectCallSessionLifecycleOptions
// Each groups one logical domain so consumers can name what they actually need.
// UseDirectCallSessionLifecycleOptions is the intersection of all five — zero callers change.
// ---------------------------------------------------------------------------

/** DOM element refs for local and remote video/audio elements. */
export interface DirectCallLifecycleVideoElementRefs {
  localVideoRef: MutableRefObject<HTMLVideoElement | null>;
  localScreenPreviewRef: MutableRefObject<HTMLVideoElement | null>;
  remoteVideoRef: MutableRefObject<HTMLVideoElement | null>;
  remoteScreenVideoRef: MutableRefObject<HTMLVideoElement | null>;
  remoteCameraProbeRef: MutableRefObject<HTMLVideoElement | null>;
  remoteScreenProbeRef: MutableRefObject<HTMLVideoElement | null>;
  remoteAudioRef: MutableRefObject<HTMLAudioElement | null>;
}

/** Playback, sequence, and revision refs for remote media state tracking. */
export interface DirectCallLifecycleMediaStateRefs {
  remoteCameraPlaybackRef: PlaybackRef;
  remoteScreenPlaybackRef: PlaybackRef;
  remoteInboundVideoProgressRef: MutableRefObject<Map<string, RemoteInboundVideoProgress>>;
  callMediaStateSeqRef: MutableRefObject<number>;
  localMediaStateRevisionRef: MutableRefObject<Record<CallMediaSource, number>>;
  remoteMediaStateSeqRef: MutableRefObject<Record<CallMediaSource, number>>;
  remoteMediaStateRevisionRef: MutableRefObject<Record<CallMediaSource, number>>;
  lastIncomingMediaStateRef: MutableRefObject<Record<CallMediaSource, LastIncomingMediaState | null>>;
}

/** Refs for call session ownership: active/incoming state, WebRTC transport, and media streams. */
export interface DirectCallLifecycleSessionRefs {
  activeRef: MutableRefObject<ActiveCall | null>;
  incomingRef: MutableRefObject<IncomingCall | null>;
  acceptingIncomingCallRef: MutableRefObject<IncomingCall | null>;
  localStreamRef: MutableRefObject<MediaStream | null>;
  cameraSenderRef: MutableRefObject<RTCRtpSender | null>;
  cameraTransceiverRef: MutableRefObject<RTCRtpTransceiver | null>;
  screenShareTrackRef: MutableRefObject<MediaStreamTrack | null>;
  screenShareSenderRef: MutableRefObject<RTCRtpSender | null>;
  screenShareTransceiverRef: MutableRefObject<RTCRtpTransceiver | null>;
  localScreenPreviewStreamRef: MutableRefObject<MediaStream | null>;
  remoteAudioStreamRef: MutableRefObject<MediaStream | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  pendingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
  incomingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
  outboundMediaEncryptionOfferRef: MutableRefObject<DirectCallMediaEncryptionOffer | null>;
  clearOutgoingMediaStateTrackBindingsRef: MutableRefObject<() => void>;
  directCallLifecycleTokenRef: MutableRefObject<number>;
}

/** Mutable refs for WebRTC offer/answer and renegotiation negotiation state. */
export interface DirectCallLifecycleNegotiationRefs {
  directCallNegotiationRoleRef: MutableRefObject<DirectCallNegotiationRole>;
  supportsPeerRenegotiationV1Ref: MutableRefObject<boolean>;
  renegotiationUnsupportedRef: MutableRefObject<boolean>;
  negotiationReadyRef: MutableRefObject<boolean>;
  makingOfferRef: MutableRefObject<boolean>;
  ignoreOfferRef: MutableRefObject<boolean>;
  isSettingRemoteAnswerPendingRef: MutableRefObject<boolean>;
  renegotiationRevisionRef: MutableRefObject<number>;
  lastAppliedRemoteRenegotiationRevisionRef: MutableRefObject<number>;
  pendingLocalRenegotiationRevisionRef: MutableRefObject<number | null>;
  pendingRenegotiationReasonRef: MutableRefObject<string | null>;
  lastRenegotiationAttemptRef: MutableRefObject<Record<string, unknown> | null>;
  lastSignalingErrorRef: MutableRefObject<Record<string, unknown> | null>;
}

/** State setters and side-effect callbacks for the call lifecycle. */
export interface DirectCallLifecycleCallbacks {
  setIncoming: Dispatch<SetStateAction<IncomingCall | null>>;
  setActive: Dispatch<SetStateAction<ActiveCall | null>>;
  setIsMinimized: Dispatch<SetStateAction<boolean>>;
  outgoingIceBatchReset: () => void;
  resetRemoteMediaRuntime: () => void;
  closeDirectCallFrameCrypto: () => void;
  resetMinimizedDockState: () => void;
  resetLocalPreviewState: () => void;
  resetLocalScreenPreviewState: () => void;
  pushNotice: PushNotice;
  configureDirectCallFrameCrypto: (params: {
    callId: string;
    mediaEncryptionMode: DirectCallMediaEncryptionMode;
    peerUserId: string;
    peerDeviceId: string | null;
  }) => Promise<boolean>;
  isCurrentActiveCallContext: (callId: string, pc?: RTCPeerConnection | null) => boolean;
  t: Translate;
}

/**
 * Full options bag for useDirectCallSessionLifecycle.
 * Defined as an intersection of five sub-context interfaces plus scalar/presentation
 * fields so each concern is self-documenting. Callers pass a flat object — the
 * intersection is structural, not nominal, so nothing changes at the call site.
 */
export type UseDirectCallSessionLifecycleOptions =
  DirectCallLifecycleVideoElementRefs &
  DirectCallLifecycleMediaStateRefs &
  DirectCallLifecycleSessionRefs &
  DirectCallLifecycleNegotiationRefs &
  DirectCallLifecycleCallbacks & {
    // scalar/presentation fields that don't fit a group
    active: ActiveCall | null;
    incomingCallId: string | null;
    callSecurityMode: CallSecurityMode;
    remoteVideoReady: boolean;
    remoteScreenReady: boolean;
    remoteCameraSlot: RemoteMediaSlot;
    remoteScreenSlot: RemoteMediaSlot;
    remoteCameraStreamRef: MutableRefObject<MediaStream | null>;
    remoteScreenStreamRef: MutableRefObject<MediaStream | null>;
    frameModeRecoveryTimerRef: MutableRefObject<number | null>;
    frameModeRecoveryAttemptedCallIdRef: MutableRefObject<string | null>;
    incomingRingtoneRef: MutableRefObject<HTMLAudioElement | null>;
    outgoingRingtoneRef: MutableRefObject<HTMLAudioElement | null>;
    disconnectResetTimerRef: MutableRefObject<number | null>;
    disconnectRecoveryAttemptedRef: MutableRefObject<boolean>;
  };

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

export interface UseDirectCallSessionLifecycleOptions {
  active: ActiveCall | null;
  incomingCallId: string | null;
  callSecurityMode: CallSecurityMode;
  remoteVideoReady: boolean;
  remoteScreenReady: boolean;
  remoteCameraSlot: RemoteMediaSlot;
  remoteScreenSlot: RemoteMediaSlot;
  remoteCameraStreamRef: MutableRefObject<MediaStream | null>;
  remoteScreenStreamRef: MutableRefObject<MediaStream | null>;
  incomingRef: MutableRefObject<IncomingCall | null>;
  acceptingIncomingCallRef: MutableRefObject<IncomingCall | null>;
  activeRef: MutableRefObject<ActiveCall | null>;
  localVideoRef: MutableRefObject<HTMLVideoElement | null>;
  localScreenPreviewRef: MutableRefObject<HTMLVideoElement | null>;
  remoteVideoRef: MutableRefObject<HTMLVideoElement | null>;
  remoteScreenVideoRef: MutableRefObject<HTMLVideoElement | null>;
  remoteCameraProbeRef: MutableRefObject<HTMLVideoElement | null>;
  remoteScreenProbeRef: MutableRefObject<HTMLVideoElement | null>;
  remoteAudioRef: MutableRefObject<HTMLAudioElement | null>;
  remoteCameraPlaybackRef: PlaybackRef;
  remoteScreenPlaybackRef: PlaybackRef;
  remoteInboundVideoProgressRef: MutableRefObject<Map<string, RemoteInboundVideoProgress>>;
  callMediaStateSeqRef: MutableRefObject<number>;
  localMediaStateRevisionRef: MutableRefObject<Record<CallMediaSource, number>>;
  remoteMediaStateSeqRef: MutableRefObject<Record<CallMediaSource, number>>;
  remoteMediaStateRevisionRef: MutableRefObject<Record<CallMediaSource, number>>;
  lastIncomingMediaStateRef: MutableRefObject<Record<CallMediaSource, LastIncomingMediaState | null>>;
  setIncoming: Dispatch<SetStateAction<IncomingCall | null>>;
  setActive: Dispatch<SetStateAction<ActiveCall | null>>;
  setIsMinimized: Dispatch<SetStateAction<boolean>>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  localStreamRef: MutableRefObject<MediaStream | null>;
  cameraSenderRef: MutableRefObject<RTCRtpSender | null>;
  cameraTransceiverRef: MutableRefObject<RTCRtpTransceiver | null>;
  screenShareTrackRef: MutableRefObject<MediaStreamTrack | null>;
  screenShareSenderRef: MutableRefObject<RTCRtpSender | null>;
  screenShareTransceiverRef: MutableRefObject<RTCRtpTransceiver | null>;
  localScreenPreviewStreamRef: MutableRefObject<MediaStream | null>;
  remoteAudioStreamRef: MutableRefObject<MediaStream | null>;
  outgoingIceBatchReset: () => void;
  resetRemoteMediaRuntime: () => void;
  closeDirectCallFrameCrypto: () => void;
  resetMinimizedDockState: () => void;
  resetLocalPreviewState: () => void;
  resetLocalScreenPreviewState: () => void;
  configureDirectCallFrameCrypto: (params: {
    callId: string;
    mediaEncryptionMode: DirectCallMediaEncryptionMode;
    peerUserId: string;
    peerDeviceId: string | null;
  }) => Promise<boolean>;
  pushNotice: PushNotice;
  t: Translate;
  outboundMediaEncryptionOfferRef: MutableRefObject<DirectCallMediaEncryptionOffer | null>;
  pendingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
  incomingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
  frameModeRecoveryTimerRef: MutableRefObject<number | null>;
  frameModeRecoveryAttemptedCallIdRef: MutableRefObject<string | null>;
  incomingRingtoneRef: MutableRefObject<HTMLAudioElement | null>;
  directCallLifecycleTokenRef: MutableRefObject<number>;
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
  disconnectResetTimerRef: MutableRefObject<number | null>;
  disconnectRecoveryAttemptedRef: MutableRefObject<boolean>;
  clearOutgoingMediaStateTrackBindingsRef: MutableRefObject<() => void>;
  isCurrentActiveCallContext: (callId: string, pc?: RTCPeerConnection | null) => boolean;
}

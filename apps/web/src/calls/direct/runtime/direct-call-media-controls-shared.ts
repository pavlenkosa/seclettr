import type { MutableRefObject } from "react";
import type { CallSecurityMode } from "@/ui-settings";
import type { DirectCallMediaEncryptionMode } from "@/calls/direct/model/call-media-encryption-negotiation";
import type {
  CallMediaSource,
  CallMediaState,
  CallMediaStateReason,
} from "@/calls/direct/model/call-media-state";
import type {
  ActiveCall,
  CallNotice,
} from "@/calls/direct/model/direct-call-types";

// Local utility types — used only within this file's interface definitions.
// Not part of the public API of this contract file; do not import from consumers.
type Translate = (key: string, params?: Record<string, string | number | undefined>) => string;
type PushNotice = (next: CallNotice, timeoutMs?: number) => void;
export type DirectCallScreenShareStopReason = Extract<
  CallMediaStateReason,
  "user-toggle" | "track-ended" | "replace-track" | "cleanup"
>;

// ---------------------------------------------------------------------------
// Base context shared by all media-control consumers
// ---------------------------------------------------------------------------

/**
 * Options shared between outgoing-media-state tracking and visual media controls.
 * The three outgoing-state refs (cameraTransceiverRef, callMediaStateSeqRef,
 * localMediaStateRevisionRef) are the only fields NOT included here — they are
 * exclusively needed by useDirectCallOutgoingMediaState and so live on the
 * full DirectCallMediaControlsOptions extension.
 */
export interface DirectCallMediaControlsBase {
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
  callSecurityMode: CallSecurityMode;
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
  ensureDirectCallSenderFrameCryptoBound: (callId: string) => boolean;
  configureDirectCallFrameCrypto: (params: {
    callId: string;
    mediaEncryptionMode: DirectCallMediaEncryptionMode;
    peerUserId: string;
    peerDeviceId: string;
  }) => Promise<boolean>;
  resetCallState: (opts?: { sendHangup?: boolean; notice?: CallNotice }) => void;
  pushNotice: PushNotice;
  t: Translate;
}

/**
 * Full options for hooks that also track outgoing media state.
 * Extends the base with the three refs only needed for media-state sequencing.
 */
export interface DirectCallMediaControlsOptions extends DirectCallMediaControlsBase {
  cameraTransceiverRef: MutableRefObject<RTCRtpTransceiver | null>;
  callMediaStateSeqRef: MutableRefObject<number>;
  localMediaStateRevisionRef: MutableRefObject<Record<CallMediaSource, number>>;
}

export interface DirectCallOutgoingMediaStateControls {
  sendCallMediaState: (
    source: CallMediaSource,
    state: CallMediaState,
    callIdOverride?: string,
    reason?: CallMediaStateReason
  ) => void;
  syncOutgoingVisualMediaStateTrackBindings: (callIdOverride?: string) => void;
  clearOutgoingMediaStateTrackBindings: () => void;
  clearOutgoingVisualMediaStateTrackBinding: (source: "camera" | "screen") => void;
}

/**
 * Options for visual media controls (camera toggle, switch, screen share).
 * Extends DirectCallMediaControlsBase directly — no Pick needed — and adds
 * the active call snapshot plus outgoing-state callbacks from
 * DirectCallOutgoingMediaStateControls.
 */
export interface DirectCallVisualMediaControlsOptions extends DirectCallMediaControlsBase {
  active: ActiveCall | null;
  sendCallMediaState: DirectCallOutgoingMediaStateControls["sendCallMediaState"];
  syncOutgoingVisualMediaStateTrackBindings: DirectCallOutgoingMediaStateControls["syncOutgoingVisualMediaStateTrackBindings"];
  clearOutgoingVisualMediaStateTrackBinding: DirectCallOutgoingMediaStateControls["clearOutgoingVisualMediaStateTrackBinding"];
}

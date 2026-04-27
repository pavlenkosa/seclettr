import type { WsServerMessage } from "@seclettr/protocol";
import type {
  DirectCallMediaEncryptionMode,
  DirectCallMediaEncryptionOffer,
} from "@/calls/direct/model/call-media-encryption-negotiation";

export type CallType = "audio" | "video";
/**
 * Authoritative runtime session phase written by direct-call runtime.
 *
 * This is intentionally narrower than the UI/debug runtime state. Presentation
 * can derive richer states such as "reconnecting" or "screen_sharing", but the
 * runtime only persists the phases it actually commits.
 */
type DirectCallSessionState =
  | "ringing"
  | "connecting"
  | "active";

type CallOfferMediaEncryption = {
  preferredMode: DirectCallMediaEncryptionMode;
  supportedModes: readonly DirectCallMediaEncryptionMode[];
};

type CallAnswerMediaEncryption = {
  selectedMode: DirectCallMediaEncryptionMode;
  supportedModes: readonly DirectCallMediaEncryptionMode[];
};

export type IncomingCallOfferSignal = Extract<WsServerMessage, { type: "call.offer" }> & {
  mediaEncryption?: CallOfferMediaEncryption;
};

export type IncomingCallAnsweredSignal = Extract<WsServerMessage, { type: "call.answered" }> & {
  mediaEncryption?: CallAnswerMediaEncryption;
};

export type IncomingCallRenegotiationOfferSignal = Extract<
  WsServerMessage,
  { type: "call.renegotiate.offer" }
>;

export type IncomingCallRenegotiationAnswerSignal = Extract<
  WsServerMessage,
  { type: "call.renegotiate.answer" }
>;

export type IncomingCallMediaStateSignal = Extract<WsServerMessage, { type: "call.media_state" }>;

type DirectCallFeatures = {
  renegotiationV1: true;
};

export interface IncomingCall {
  callId: string;
  callerUserId: string;
  callerDeviceId: string | null;
  callerLabel: string;
  callType: CallType;
  targetUserId: string | null;
  auth?: Extract<WsServerMessage, { type: "call.offer" }>["auth"];
  offerSdp: string;
  mediaEncryptionOffer: DirectCallMediaEncryptionOffer;
  supportsRenegotiationV1: boolean;
}

export interface ActiveCall {
  callId: string;
  peerUserId: string;
  peerDeviceId: string | null;
  peerLabel: string;
  callType: CallType;
  direction: "outbound" | "inbound";
  state: DirectCallSessionState;
  muted: boolean;
  videoOff: boolean;
  screenSharing: boolean;
  duration: number;
  durationStartedAtMs?: number | null;
  signalingVerified: boolean;
  e2eeActive: boolean;
  verificationCode: string | null;
  verificationHash: string | null;
  verificationError: string | null;
  mediaEncryptionMode: DirectCallMediaEncryptionMode;
  peerSupportsRenegotiationV1: boolean;
}

export interface DirectCallFrameCryptoState {
  callId: string;
  localUserId: string;
  localDeviceId: string;
  peerUserId: string;
  peerDeviceId: string;
  sendKeyBytes: Uint8Array;
  recvKeyBytes: Uint8Array;
}

export interface CallNotice {
  kind: "info" | "error";
  message: string;
}

export interface RemoteInboundVideoProgress {
  frames: number;
  bytes: number;
  packets: number;
  lastProgressAt: number;
  hasTelemetry: boolean;
}

export interface DirectCallPanelHandle {
  startCall: (peerUserId: string, callType: CallType, peerLabel?: string) => Promise<void>;
}

export interface DirectCallOutgoingIceBatchState {
  callId: string | null;
  candidates: string[];
  timer: number | null;
}

export const ICE_BATCH_FLUSH_MS = 25;
export const ICE_BATCH_MAX_ITEMS = 8;
export const REMOTE_MIN_FRAME_DIMENSION = 32;
export const REMOTE_TRACK_ACTIVE_WINDOW_MS = 1300;
export const DISCONNECT_RESET_GRACE_MS = 5000;

export const DIRECT_CALL_FEATURES: DirectCallFeatures = {
  renegotiationV1: true,
};
export type DirectCallSurface =
  | "hidden"
  | "incoming-fullscreen"
  | "incoming-minimized"
  | "active-fullscreen"
  | "active-minimized";

interface ResolveDirectCallSurfaceInput {
  hasIncoming: boolean;
  hasActive: boolean;
  isMinimized: boolean;
}

export function resolveDirectCallSurface({
  hasIncoming,
  hasActive,
  isMinimized,
}: ResolveDirectCallSurfaceInput): DirectCallSurface {
  if (hasActive) {
    return isMinimized ? "active-minimized" : "active-fullscreen";
  }

  if (hasIncoming) {
    return isMinimized ? "incoming-minimized" : "incoming-fullscreen";
  }

  return "hidden";
}

import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";

import type { CallSecurityMode } from "@/ui-settings";
import type {
  ActiveCall,
  CallNotice,
  CallType,
  IncomingCall,
} from "@/calls/direct/model/direct-call-types";
import type {
  DirectCallMediaEncryptionMode,
  DirectCallMediaEncryptionOffer,
} from "@/calls/direct/model/call-media-encryption-negotiation";
import { resolveDirectCallNegotiationRole } from "@/calls/direct/model/direct-call-lifecycle";
import { type DirectCallFinishSession } from "./direct-call-runtime-types";

// Local utility types — used only within this file's interface definitions.
// Not part of the public API of this contract file; do not import from consumers.
type Translate = (key: string, params?: Record<string, string | number | undefined>) => string;
type PushNotice = (next: CallNotice, timeoutMs?: number) => void;
export type CommitDirectCallState<T> = (next: SetStateAction<T | null>) => void;

/** All mutable ref objects related to WebRTC offer/answer negotiation lifecycle. */
export interface DirectCallNegotiationRefs {
  directCallNegotiationRoleRef: MutableRefObject<"polite" | "impolite">;
  supportsPeerRenegotiationV1Ref: MutableRefObject<boolean>;
  sendRenegotiationOfferRef: MutableRefObject<((callId: string, reason: string) => Promise<void>) | null>;
  flushPendingRenegotiationOfferRef: MutableRefObject<((callId: string, trigger: string) => Promise<void>) | null>;
  negotiationReadyRef: MutableRefObject<boolean>;
  makingOfferRef: MutableRefObject<boolean>;
  ignoreOfferRef: MutableRefObject<boolean>;
  isSettingRemoteAnswerPendingRef: MutableRefObject<boolean>;
  renegotiationRevisionRef: MutableRefObject<number>;
  lastAppliedRemoteRenegotiationRevisionRef: MutableRefObject<number>;
  pendingLocalRenegotiationRevisionRef: MutableRefObject<number | null>;
  pendingRenegotiationReasonRef: MutableRefObject<string | null>;
  renegotiationUnsupportedRef: MutableRefObject<boolean>;
  lastRenegotiationAttemptRef: MutableRefObject<Record<string, unknown> | null>;
  lastSignalingErrorRef: MutableRefObject<Record<string, unknown> | null>;
  disconnectResetTimerRef: MutableRefObject<number | null>;
  disconnectRecoveryAttemptedRef: MutableRefObject<boolean>;
}

// ---------------------------------------------------------------------------
// Sub-contexts for DirectCallSetupRuntimeOptions
// Each groups one logical domain so consumers can name what they actually need.
// DirectCallSetupRuntimeOptions is the intersection of all five — zero callers change.
// ---------------------------------------------------------------------------

/** Refs and callbacks for call session ownership (active / incoming state). */
export interface DirectCallSetupSessionContext {
  activeRef: MutableRefObject<ActiveCall | null>;
  incomingRef: MutableRefObject<IncomingCall | null>;
  acceptingIncomingCallRef: MutableRefObject<IncomingCall | null>;
  directCallLifecycleTokenRef: MutableRefObject<number>;
  outgoingRingingTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  commitIncomingState: CommitDirectCallState<IncomingCall>;
  commitActiveState: CommitDirectCallState<ActiveCall>;
  setIsMinimized: Dispatch<SetStateAction<boolean>>;
  resetMinimizedDockState: () => void;
}

/** Mutable refs for WebRTC offer/answer and renegotiation state. */
export interface DirectCallSetupNegotiationContext {
  directCallNegotiationRoleRef: MutableRefObject<"polite" | "impolite">;
  supportsPeerRenegotiationV1Ref: MutableRefObject<boolean>;
  renegotiationUnsupportedRef: MutableRefObject<boolean>;
  negotiationReadyRef: MutableRefObject<boolean>;
  makingOfferRef: MutableRefObject<boolean>;
  ignoreOfferRef: MutableRefObject<boolean>;
  isSettingRemoteAnswerPendingRef: MutableRefObject<boolean>;
  renegotiationRevisionRef: MutableRefObject<number>;
  lastAppliedRemoteRenegotiationRevisionRef: MutableRefObject<number>;
  pendingLocalRenegotiationRevisionRef: MutableRefObject<number | null>;
  outboundMediaEncryptionOfferRef: MutableRefObject<DirectCallMediaEncryptionOffer | null>;
}

/** Refs and ICE state for WebRTC transport. */
export interface DirectCallSetupTransportContext {
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  pendingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
  incomingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
}

/** Functions that set up and manage local/remote media streams. */
export interface DirectCallSetupMediaContext {
  createPeerConnection: (callId: string) => Promise<RTCPeerConnection>;
  ensureVideoSenders: (pc: RTCPeerConnection) => void;
  requestLocalStream: (options: { withVideo: boolean }) => Promise<MediaStream>;
  attachLocalTracksToPeer: (pc: RTCPeerConnection, stream: MediaStream) => Promise<void>;
  syncVisualTransceiverBindings: () => void;
  syncVisualTransceiverDirections: (callId: string) => void;
  syncOutgoingVisualMediaStateTrackBindings: (callIdOverride?: string) => void;
  refreshRemoteVideoTracksFromPeer: (callIdOverride?: string, reason?: string) => void;
}

/** Frame-level crypto, security-mode policy, and ephemeral-key exchange. */
export interface DirectCallSetupCryptoContext {
  callSecurityMode: CallSecurityMode;
  resolveLocalSupportedMediaEncryptionModes: () => readonly DirectCallMediaEncryptionMode[];
  primeDirectCallSenderFrameCrypto: (callId: string) => boolean;
  closeDirectCallFrameCrypto: () => void;
  configureDirectCallFrameCrypto: (params: {
    callId: string;
    mediaEncryptionMode: DirectCallMediaEncryptionMode;
    peerUserId: string;
    peerDeviceId: string | null;
  }) => Promise<boolean>;
  prepareLocalEphemeralKey: (callId: string) => Promise<string>;
  setPeerEphemeralPublicKey: (callId: string, pubKeyBase64: string | null | undefined) => void;
  applyCallSecurityState: (callId: string, pc: RTCPeerConnection) => Promise<void>;
}

/** UI feedback and call-event recording. */
export interface DirectCallSetupCallbackContext {
  clearNotice: () => void;
  ensureConversationUsername: (userId: string, fallbackLabel?: string) => Promise<string | null>;
  resolvePeerLabel: (userId: string, fallbackLabel?: string) => string;
  pushNotice: PushNotice;
  callChatKindRef: MutableRefObject<"plain" | "e2ee" | null>;
  recordCallEvent: (event: {
    userId: string;
    fallbackLabel?: string;
    mode: CallType;
    direction: "inbound" | "outbound";
    outcome: "declined" | "ended";
    durationSec?: number;
    chatKind?: "plain" | "e2ee";
  }) => void;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  finishCallSession: DirectCallFinishSession;
  t: Translate;
}

/**
 * Full options bag for useDirectCallSetupControlRuntime.
 * Defined as an intersection of the five sub-contexts so each concern is
 * self-documenting. Callers pass a flat object — the intersection is structural,
 * not nominal, so nothing changes at the call site.
 */
export type DirectCallSetupRuntimeOptions =
  DirectCallSetupSessionContext &
  DirectCallSetupNegotiationContext &
  DirectCallSetupTransportContext &
  DirectCallSetupMediaContext &
  DirectCallSetupCryptoContext &
  DirectCallSetupCallbackContext;

/**
 * Resets all mutable negotiation state refs to their zero/default values.
 * Intended for call teardown (resetCallState). For call setup, use
 * resetNegotiationSessionState which additionally configures role and
 * renegotiation version flags.
 */
export function clearDirectCallNegotiationState(refs: Pick<
  DirectCallNegotiationRefs,
  | "directCallNegotiationRoleRef"
  | "supportsPeerRenegotiationV1Ref"
  | "renegotiationUnsupportedRef"
  | "negotiationReadyRef"
  | "makingOfferRef"
  | "ignoreOfferRef"
  | "isSettingRemoteAnswerPendingRef"
  | "renegotiationRevisionRef"
  | "lastAppliedRemoteRenegotiationRevisionRef"
  | "pendingLocalRenegotiationRevisionRef"
  | "pendingRenegotiationReasonRef"
  | "lastRenegotiationAttemptRef"
  | "lastSignalingErrorRef"
  | "disconnectRecoveryAttemptedRef"
>): void {
  refs.directCallNegotiationRoleRef.current = "impolite";
  refs.supportsPeerRenegotiationV1Ref.current = false;
  refs.renegotiationUnsupportedRef.current = false;
  refs.negotiationReadyRef.current = false;
  refs.makingOfferRef.current = false;
  refs.ignoreOfferRef.current = false;
  refs.isSettingRemoteAnswerPendingRef.current = false;
  refs.renegotiationRevisionRef.current = 0;
  refs.lastAppliedRemoteRenegotiationRevisionRef.current = 0;
  refs.pendingLocalRenegotiationRevisionRef.current = null;
  refs.pendingRenegotiationReasonRef.current = null;
  refs.lastRenegotiationAttemptRef.current = null;
  refs.lastSignalingErrorRef.current = null;
  refs.disconnectRecoveryAttemptedRef.current = false;
}

export function resetNegotiationSessionState(
  direction: "inbound" | "outbound",
  supportsPeerRenegotiationV1: boolean,
  refs: Pick<
    DirectCallSetupNegotiationContext,
    | "directCallNegotiationRoleRef"
    | "supportsPeerRenegotiationV1Ref"
    | "renegotiationUnsupportedRef"
    | "negotiationReadyRef"
    | "makingOfferRef"
    | "ignoreOfferRef"
    | "isSettingRemoteAnswerPendingRef"
    | "renegotiationRevisionRef"
    | "lastAppliedRemoteRenegotiationRevisionRef"
    | "pendingLocalRenegotiationRevisionRef"
  >
) {
  refs.directCallNegotiationRoleRef.current = resolveDirectCallNegotiationRole(direction);
  refs.supportsPeerRenegotiationV1Ref.current = supportsPeerRenegotiationV1;
  refs.renegotiationUnsupportedRef.current = false;
  refs.negotiationReadyRef.current = false;
  refs.makingOfferRef.current = false;
  refs.ignoreOfferRef.current = false;
  refs.isSettingRemoteAnswerPendingRef.current = false;
  refs.renegotiationRevisionRef.current = 0;
  refs.lastAppliedRemoteRenegotiationRevisionRef.current = 0;
  refs.pendingLocalRenegotiationRevisionRef.current = null;
}

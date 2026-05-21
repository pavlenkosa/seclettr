/**
 * useDirectCallSignalRuntime — WebSocket signal ingress hub for 1:1 calls.
 *
 * Subscribes to WebSocket messages via useDirectCallSignalSubscription and
 * routes each incoming signal type to the appropriate handler:
 *   call.offer        → commitIncomingState (surface shows ringing)
 *   call.answered     → handleRemoteAnswer
 *   renegotiate.offer → handleIncomingRenegotiationOffer
 *   renegotiate.answer→ handleIncomingRenegotiationAnswer
 *   ice               → pendingIceCandidatesRef / incomingIceCandidatesRef
 *   media_state       → processIncomingMediaStateHint
 *   hangup / rejected → finishCallSession
 *
 * This hook does not own state — it only routes signals to callbacks
 * provided by the controller. All business decisions live in the handlers.
 */
import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { type CallMediaSource, type LastIncomingMediaState, type IncomingMediaStateHint } from "@/calls/direct/model/call-media-state";
import type {
  ActiveCall,
  IncomingCall,
  IncomingCallAnsweredSignal,
  IncomingCallRenegotiationAnswerSignal,
  IncomingCallRenegotiationOfferSignal,
} from "@/calls/direct/model/direct-call-types";
import {
  type RemoteMediaSlot,
} from "@/calls/direct/model/call-media-slots";
import {
  useDirectCallSignalCommandRuntime,
  useDirectCallSignalMediaIngress,
  useDirectCallSignalOfferIngress,
  useDirectCallSignalOutcomeHandlers,
  useDirectCallSignalSubscription,
} from "./signal";
import type {
  DirectCallFinishSession,
  DirectCallPushNotice,
  DirectCallTranslate,
} from "./direct-call-runtime-types";

type EnsureConversationUsername = (
  userId: string,
  fallbackUsername?: string
) => Promise<string | null | undefined>;

interface UseDirectCallSignalRuntimeOptions {
  activeRef: MutableRefObject<ActiveCall | null>;
  incomingRef: MutableRefObject<IncomingCall | null>;
  acceptingIncomingCallRef: MutableRefObject<IncomingCall | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  incomingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
  pendingIceCandidatesRef: MutableRefObject<Map<string, RTCIceCandidateInit[]>>;
  ignoreOfferRef: MutableRefObject<boolean>;
  supportsPeerRenegotiationV1Ref: MutableRefObject<boolean>;
  renegotiationUnsupportedRef: MutableRefObject<boolean>;
  lastSignalingErrorRef: MutableRefObject<Record<string, unknown> | null>;
  lastRenegotiationAttemptRef: MutableRefObject<Record<string, unknown> | null>;
  remoteMediaStateSeqRef: MutableRefObject<Record<CallMediaSource, number>>;
  remoteMediaStateRevisionRef: MutableRefObject<Record<CallMediaSource, number>>;
  lastIncomingMediaStateRef: MutableRefObject<Record<CallMediaSource, LastIncomingMediaState | null>>;
  remoteCameraSlotRef: MutableRefObject<RemoteMediaSlot>;
  remoteScreenSlotRef: MutableRefObject<RemoteMediaSlot>;
  setActive: Dispatch<SetStateAction<ActiveCall | null>>;
  setIncoming: Dispatch<SetStateAction<IncomingCall | null>>;
  setIsMinimized: Dispatch<SetStateAction<boolean>>;
  ensureConversationUsername: EnsureConversationUsername;
  resetMinimizedDockState: () => void;
  resolvePeerLabel: (userId: string, fallbackLabel?: string) => string;
  pushNotice: DirectCallPushNotice;
  callChatKindRef: MutableRefObject<"plain" | "e2ee" | null>;
  recordCallEvent: (params: {
    userId: string;
    fallbackLabel?: string;
    mode: "audio" | "video";
    direction: "inbound" | "outbound";
    outcome: "ended" | "declined" | "missed";
    durationSec?: number;
    chatKind?: "plain" | "e2ee";
  }) => void;
  rejectIncomingCall: (callId: string) => void;
  finishCallSession: DirectCallFinishSession;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  shouldIgnoreUnexpectedPeerSignal: (params: {
    callId: string;
    signalType: string;
    senderUserId?: string | null;
    senderDeviceId?: string | null;
    revision?: number;
    source?: string;
  }) => boolean;
  /**
   * Process incoming media state as a hint to the remote media runtime.
   * This is the ADVISORY path - actual slot lifecycle is controlled by
   * useDirectCallRemoteMediaRuntime based on track events.
   */
  processIncomingMediaStateHint: (
    source: "camera" | "screen",
    hint: IncomingMediaStateHint,
    trackId: string | null,
    trackEnded: boolean
  ) => void;
  handleRemoteAnswer: (message: IncomingCallAnsweredSignal) => Promise<void>;
  handleIncomingRenegotiationOffer: (message: IncomingCallRenegotiationOfferSignal) => Promise<void>;
  handleIncomingRenegotiationAnswer: (message: IncomingCallRenegotiationAnswerSignal) => Promise<void>;
  t: DirectCallTranslate;
}

export function useDirectCallSignalRuntime({
  activeRef,
  incomingRef,
  acceptingIncomingCallRef,
  peerConnectionRef,
  incomingIceCandidatesRef,
  pendingIceCandidatesRef,
  ignoreOfferRef,
  supportsPeerRenegotiationV1Ref,
  renegotiationUnsupportedRef,
  lastSignalingErrorRef,
  lastRenegotiationAttemptRef,
  remoteMediaStateSeqRef,
  remoteMediaStateRevisionRef,
  lastIncomingMediaStateRef,
  remoteCameraSlotRef,
  remoteScreenSlotRef,
  setActive,
  setIncoming,
  setIsMinimized,
  ensureConversationUsername,
  resetMinimizedDockState,
  resolvePeerLabel,
  pushNotice,
  callChatKindRef,
  recordCallEvent,
  rejectIncomingCall,
  finishCallSession,
  debugCallMedia,
  shouldIgnoreUnexpectedPeerSignal,
  processIncomingMediaStateHint,
  handleRemoteAnswer,
  handleIncomingRenegotiationOffer,
  handleIncomingRenegotiationAnswer,
  t,
}: UseDirectCallSignalRuntimeOptions) {
  const {
    handleAnsweredSignal,
    handleRenegotiationOfferSignal,
    handleRenegotiationAnswerSignal,
  } = useDirectCallSignalCommandRuntime({
    activeRef,
    peerConnectionRef,
    lastSignalingErrorRef,
    lastRenegotiationAttemptRef,
    debugCallMedia,
    finishCallSession,
    handleRemoteAnswer,
    handleIncomingRenegotiationOffer,
    handleIncomingRenegotiationAnswer,
    t,
  });
  const {
    applyIncomingIceCandidate,
    applyIncomingCallMediaState,
  } = useDirectCallSignalMediaIngress({
    activeRef,
    incomingRef,
    acceptingIncomingCallRef,
    peerConnectionRef,
    incomingIceCandidatesRef,
    pendingIceCandidatesRef,
    ignoreOfferRef,
    remoteMediaStateSeqRef,
    remoteMediaStateRevisionRef,
    lastIncomingMediaStateRef,
    remoteCameraSlotRef,
    remoteScreenSlotRef,
    debugCallMedia,
    shouldIgnoreUnexpectedPeerSignal,
    processIncomingMediaStateHint,
  });
  const {
    handleIncomingOfferSignal,
  } = useDirectCallSignalOfferIngress({
    activeRef,
    incomingRef,
    acceptingIncomingCallRef,
    setActive,
    setIncoming,
    setIsMinimized,
    ensureConversationUsername,
    resetMinimizedDockState,
    resolvePeerLabel,
    callChatKindRef,
    rejectIncomingCall,
    debugCallMedia,
  });

  const {
    handleIncomingHangupSignal,
    handleCallErrorSignal,
    handleCallRejectedSignal,
  } = useDirectCallSignalOutcomeHandlers({
    activeRef,
    incomingRef,
    acceptingIncomingCallRef,
    renegotiationUnsupportedRef,
    supportsPeerRenegotiationV1Ref,
    lastSignalingErrorRef,
    lastRenegotiationAttemptRef,
    callChatKindRef,
    setActive,
    finishCallSession,
    pushNotice,
    recordCallEvent,
    debugCallMedia,
    t,
  });

  useDirectCallSignalSubscription({
    onOffer: handleIncomingOfferSignal,
    onAnswered: handleAnsweredSignal,
    onRenegotiationOffer: handleRenegotiationOfferSignal,
    onRenegotiationAnswer: handleRenegotiationAnswerSignal,
    onIceCandidate: applyIncomingIceCandidate,
    onMediaState: applyIncomingCallMediaState,
    onHangup: handleIncomingHangupSignal,
    onRejected: handleCallRejectedSignal,
    onError: handleCallErrorSignal,
  });
}

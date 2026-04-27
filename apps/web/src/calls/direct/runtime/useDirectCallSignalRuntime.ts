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
import { resolveLegacyDirectCallMediaEncryptionOffer } from "@/calls/direct/model/call-media-encryption-negotiation";
import { useAuthStore } from "@/stores/auth";
import {
  toIncomingMediaStateHint,
  shouldApplyIncomingMediaState,
  type CallMediaSource,
  type LastIncomingMediaState,
  type IncomingMediaStateHint,
} from "@/calls/direct/model/call-media-state";
import type {
  ActiveCall,
  CallType,
  IncomingCall,
  IncomingCallAnsweredSignal,
  IncomingCallMediaStateSignal,
  IncomingCallOfferSignal,
  IncomingCallRenegotiationAnswerSignal,
  IncomingCallRenegotiationOfferSignal,
} from "@/calls/direct/model/direct-call-types";
import {
  type RemoteMediaSlot,
} from "@/calls/direct/model/call-media-slots";
import { useDirectCallSignalOutcomeHandlers } from "./useDirectCallSignalOutcomeHandlers";
import { useDirectCallSignalSubscription } from "./useDirectCallSignalSubscription";
import { logger } from "@/lib/logger.js";
import type {
  DirectCallFinishSession,
  DirectCallPushNotice,
  DirectCallTranslate,
} from "./direct-call-runtime-types";

type RecordCallEvent = (params: {
  userId: string;
  fallbackLabel?: string;
  mode: CallType;
  direction: "inbound" | "outbound";
  outcome: "ended" | "declined" | "missed";
  durationSec?: number;
}) => void;

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
  pendingIceCandidatesRef: MutableRefObject<RTCIceCandidateInit[]>;
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
  recordCallEvent: RecordCallEvent;
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
  const runGuardedSignalCommand = useCallback((params: {
    callId: string;
    signalType: "call.answered" | "call.renegotiate.offer" | "call.renegotiate.answer";
    revision?: number;
    run: () => Promise<void>;
  }) => {
    params.run().catch((error) => {
      const pc = peerConnectionRef.current;
      if (activeRef.current?.callId !== params.callId) {
        debugCallMedia("signal-command-ignored-stale", {
          callId: params.callId,
          signalType: params.signalType,
          revision: params.revision ?? null,
          errorName: error instanceof Error ? error.name : null,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      const errorPayload = {
        code: "ASYNC_SIGNAL_HANDLER_FAILED",
        callId: params.callId,
        signalType: params.signalType,
        revision: params.revision ?? null,
        errorName: error instanceof Error ? error.name : null,
        errorMessage: error instanceof Error ? error.message : String(error),
        signalingState: pc?.signalingState ?? null,
        remoteDescriptionType: pc?.remoteDescription?.type ?? null,
      };
      lastSignalingErrorRef.current = {
        ...errorPayload,
        at: new Date().toISOString(),
      };
      if (params.signalType !== "call.answered") {
        lastRenegotiationAttemptRef.current = {
          ...lastRenegotiationAttemptRef.current,
          callId: params.callId,
          signalType: params.signalType,
          revision: params.revision ?? null,
          stage: "signal-handler-failed",
          error: errorPayload.errorMessage,
          at: new Date().toISOString(),
        };
      }
      debugCallMedia("signal-command-failed", errorPayload);
      logger.warn("[CALL] async signal command failed", error);

      // Once a current-session signal handler throws, local WebRTC/signaling
      // state is no longer trustworthy. End through the normal teardown path.
      finishCallSession({
        reason: "signal-handler-failed",
        authority: "hangup",
        callId: params.callId,
        notice: params.signalType === "call.answered"
          ? { kind: "error", message: t("call.error.unableStart") }
          : { kind: "error", message: t("call.notice.connectionFailed") },
      });
    });
  }, [
    activeRef,
    debugCallMedia,
    finishCallSession,
    lastRenegotiationAttemptRef,
    lastSignalingErrorRef,
    peerConnectionRef,
    t,
  ]);

  const applyIncomingIceCandidate = useCallback((callId: string, candidate: RTCIceCandidateInit) => {
    const currentActive = activeRef.current;
    if (currentActive?.callId !== callId) {
      if (
        incomingRef.current?.callId === callId ||
        acceptingIncomingCallRef.current?.callId === callId
      ) {
        // Accept can hide incoming UI before activeRef exists; keep trickle ICE
        // attached to that call until setup promotes it to the active session.
        const queued = incomingIceCandidatesRef.current.get(callId) ?? [];
        queued.push(candidate);
        incomingIceCandidatesRef.current.set(callId, queued);
      }
      return;
    }

    const pc = peerConnectionRef.current;
    if (!pc) return;
    if (!pc.remoteDescription) {
      pendingIceCandidatesRef.current.push(candidate);
      return;
    }

    pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((error) => {
      if (ignoreOfferRef.current) {
        debugCallMedia("ice-candidate-ignored", {
          callId,
          reason: "ignored-offer-collision",
        });
        return;
      }
      logger.warn("[CALL] failed to add ICE candidate", error);
    });
  }, [
    acceptingIncomingCallRef,
    activeRef,
    debugCallMedia,
    ignoreOfferRef,
    incomingIceCandidatesRef,
    incomingRef,
    pendingIceCandidatesRef,
    peerConnectionRef,
  ]);

  /**
   * Process incoming media state signal as a HINT.
   * 
   * IMPORTANT: This does NOT directly command slot status changes.
   * The slot lifecycle is driven by track events (in useDirectCallRemoteMediaRuntime).
   * This function only:
   * 1. Validates and sequences the incoming signal
   * 2. Stores it as lastIncomingMediaState
   * 3. Delegates to processIncomingMediaStateHint for hint processing
   */
  const applyIncomingCallMediaState = useCallback((
    message: IncomingCallMediaStateSignal
  ) => {
    const currentActive = activeRef.current;
    if (currentActive?.callId !== message.callId) return;
    if (shouldIgnoreUnexpectedPeerSignal({
      callId: message.callId,
      signalType: "call.media_state",
      senderUserId: message.senderUserId ?? null,
      senderDeviceId: message.senderDeviceId ?? null,
      source: message.source,
    })) {
      return;
    }

    const localDeviceId = useAuthStore.getState().deviceId;
    if (localDeviceId && message.senderDeviceId === localDeviceId) return;

    const prevSeq = remoteMediaStateSeqRef.current[message.source];
    const prevRevision = remoteMediaStateRevisionRef.current[message.source];
    if (!shouldApplyIncomingMediaState(prevSeq, prevRevision, message.seq, message.streamRevision)) {
      return;
    }
    remoteMediaStateSeqRef.current[message.source] = message.seq;
    remoteMediaStateRevisionRef.current[message.source] = message.streamRevision ?? prevRevision;
    lastIncomingMediaStateRef.current[message.source] = {
      seq: message.seq,
      streamRevision: message.streamRevision ?? prevRevision,
      state: message.state,
      activity: message.activity,
      reason: message.reason ?? null,
      mid: message.mid ?? null,
    };
    debugCallMedia("media-state-in", {
      callId: message.callId,
      source: message.source,
      state: message.state,
      activity: message.activity,
      mid: message.mid ?? null,
      seq: message.seq,
      streamRevision: message.streamRevision ?? prevRevision,
      reason: message.reason ?? null,
    });

    const source = message.source;
    if (source === "mic") {
      return;
    }

    const offOrOnMediaState = message.state === "off" ? "off" : "on";
    const normalizedMediaState = message.state === "ended" ? "ended" : offOrOnMediaState;
    const hint = toIncomingMediaStateHint({
      state: normalizedMediaState,
      activity: message.activity,
      reason: message.reason ?? null,
      mid: message.mid ?? null,
    });

    const slotRef = source === "camera" ? remoteCameraSlotRef : remoteScreenSlotRef;
    const currentSlot = slotRef.current;
    const currentTrack = currentSlot.stream?.getVideoTracks()[0] ?? null;
    const trackEnded = currentTrack ? currentTrack.readyState !== "live" : true;

    // Delegate to hint processor (single owner for slot lifecycle)
    processIncomingMediaStateHint(source, hint, currentSlot.trackId, trackEnded);
  }, [
    activeRef,
    debugCallMedia,
    lastIncomingMediaStateRef,
    processIncomingMediaStateHint,
    remoteCameraSlotRef,
    remoteMediaStateRevisionRef,
    remoteMediaStateSeqRef,
    remoteScreenSlotRef,
    shouldIgnoreUnexpectedPeerSignal,
  ]);

  const handleIncomingOfferSignal = useCallback((message: IncomingCallOfferSignal) => {
    if (activeRef.current) {
      rejectIncomingCall(message.callId);
      return;
    }
    if (acceptingIncomingCallRef.current) {
      if (acceptingIncomingCallRef.current.callId !== message.callId) {
        rejectIncomingCall(message.callId);
      }
      return;
    }
    if (incomingRef.current && incomingRef.current.callId !== message.callId) {
      rejectIncomingCall(message.callId);
      return;
    }

    debugCallMedia("initial-offer-received", {
      callId: message.callId,
      callerUserId: message.callerUserId,
      supportsRenegotiationV1: !!(message.features?.renegotiationV1),
    });

    ensureConversationUsername(message.callerUserId).then((resolvedLabel) => {
      if (!resolvedLabel) return;
      setIncoming((prev) => (
        prev?.callId === message.callId
          ? { ...prev, callerLabel: resolvedLabel }
          : prev
      ));
      setActive((prev) => (
        prev?.callId === message.callId
          ? { ...prev, peerLabel: resolvedLabel }
          : prev
      ));
    }).catch(() => {});

    setIncoming({
      callId: message.callId,
      callerUserId: message.callerUserId,
      callerDeviceId: message.callerDeviceId ?? null,
      callerLabel: resolvePeerLabel(message.callerUserId),
      callType: message.callType,
      targetUserId: message.targetUserId ?? null,
      auth: message.auth,
      offerSdp: message.sdp,
      mediaEncryptionOffer: message.mediaEncryption ?? resolveLegacyDirectCallMediaEncryptionOffer(),
      supportsRenegotiationV1: !!(message.features?.renegotiationV1),
    });
    setIsMinimized(false);
    resetMinimizedDockState();
  }, [
    acceptingIncomingCallRef,
    activeRef,
    debugCallMedia,
    ensureConversationUsername,
    incomingRef,
    rejectIncomingCall,
    resetMinimizedDockState,
    resolvePeerLabel,
    setActive,
    setIncoming,
    setIsMinimized,
  ]);

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
    setActive,
    finishCallSession,
    pushNotice,
    recordCallEvent,
    debugCallMedia,
    t,
  });

  const handleAnsweredSignal = useCallback((message: IncomingCallAnsweredSignal) => {
    debugCallMedia("initial-answer-received", {
      callId: message.callId,
      answererUserId: message.answererUserId ?? null,
      supportsRenegotiationV1: !!(message.features?.renegotiationV1),
    });
    if (activeRef.current?.callId !== message.callId) {
      debugCallMedia("initial-answer-ignored-missing-active-context", {
        callId: message.callId,
        activeCallId: activeRef.current?.callId ?? null,
      });
      return;
    }
    runGuardedSignalCommand({
      callId: message.callId,
      signalType: "call.answered",
      run: () => handleRemoteAnswer(message),
    });
  }, [
    activeRef,
    debugCallMedia,
    handleRemoteAnswer,
    runGuardedSignalCommand,
  ]);

  const handleRenegotiationOfferSignal = useCallback((message: IncomingCallRenegotiationOfferSignal) => {
    if (activeRef.current?.callId === message.callId) {
      runGuardedSignalCommand({
        callId: message.callId,
        signalType: "call.renegotiate.offer",
        revision: message.revision,
        run: () => handleIncomingRenegotiationOffer(message),
      });
    }
  }, [activeRef, handleIncomingRenegotiationOffer, runGuardedSignalCommand]);

  const handleRenegotiationAnswerSignal = useCallback((message: IncomingCallRenegotiationAnswerSignal) => {
    if (activeRef.current?.callId === message.callId) {
      runGuardedSignalCommand({
        callId: message.callId,
        signalType: "call.renegotiate.answer",
        revision: message.revision,
        run: () => handleIncomingRenegotiationAnswer(message),
      });
    }
  }, [activeRef, handleIncomingRenegotiationAnswer, runGuardedSignalCommand]);

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

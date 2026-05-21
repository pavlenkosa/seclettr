import { useCallback } from "react";
import type { MutableRefObject } from "react";
import { logger } from "@/lib/logger.js";
import type {
  ActiveCall,
  IncomingCallAnsweredSignal,
  IncomingCallRenegotiationAnswerSignal,
  IncomingCallRenegotiationOfferSignal,
} from "@/calls/direct/model/direct-call-types";
import type { DirectCallTranslate } from "../direct-call-runtime-types";
import type { DirectCallFinishSession } from "../direct-call-runtime-types";

/**
 * useDirectCallSignalCommandRuntime owns active-session signal command routing.
 *
 * It guards async answered/renegotiation handlers against stale-session drift,
 * records signaling failure diagnostics, and ends the current session through
 * the normal teardown path when a current-session signal handler throws.
 *
 * It does not own WebSocket subscription, offer ingress, or ICE/media hint
 * staging. Those remain in the parent signal-ingress runtime.
 */

type SignalCommandType =
  | "call.answered"
  | "call.renegotiate.offer"
  | "call.renegotiate.answer";

interface UseDirectCallSignalCommandRuntimeOptions {
  activeRef: MutableRefObject<ActiveCall | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  lastSignalingErrorRef: MutableRefObject<Record<string, unknown> | null>;
  lastRenegotiationAttemptRef: MutableRefObject<Record<string, unknown> | null>;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  finishCallSession: DirectCallFinishSession;
  handleRemoteAnswer: (message: IncomingCallAnsweredSignal) => Promise<void>;
  handleIncomingRenegotiationOffer: (
    message: IncomingCallRenegotiationOfferSignal
  ) => Promise<void>;
  handleIncomingRenegotiationAnswer: (
    message: IncomingCallRenegotiationAnswerSignal
  ) => Promise<void>;
  t: DirectCallTranslate;
}

export function useDirectCallSignalCommandRuntime({
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
}: UseDirectCallSignalCommandRuntimeOptions) {
  const runGuardedSignalCommand = useCallback((params: {
    callId: string;
    signalType: SignalCommandType;
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

  const handleAnsweredSignal = useCallback((message: IncomingCallAnsweredSignal) => {
    debugCallMedia("initial-answer-received", {
      callId: message.callId,
      answererUserId: message.answererUserId ?? null,
      supportsRenegotiationV1: !!message.features?.renegotiationV1,
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
  }, [activeRef, debugCallMedia, handleRemoteAnswer, runGuardedSignalCommand]);

  const handleRenegotiationOfferSignal = useCallback((
    message: IncomingCallRenegotiationOfferSignal
  ) => {
    if (activeRef.current?.callId === message.callId) {
      runGuardedSignalCommand({
        callId: message.callId,
        signalType: "call.renegotiate.offer",
        revision: message.revision,
        run: () => handleIncomingRenegotiationOffer(message),
      });
    }
  }, [activeRef, handleIncomingRenegotiationOffer, runGuardedSignalCommand]);

  const handleRenegotiationAnswerSignal = useCallback((
    message: IncomingCallRenegotiationAnswerSignal
  ) => {
    if (activeRef.current?.callId === message.callId) {
      runGuardedSignalCommand({
        callId: message.callId,
        signalType: "call.renegotiate.answer",
        revision: message.revision,
        run: () => handleIncomingRenegotiationAnswer(message),
      });
    }
  }, [activeRef, handleIncomingRenegotiationAnswer, runGuardedSignalCommand]);

  return {
    handleAnsweredSignal,
    handleRenegotiationOfferSignal,
    handleRenegotiationAnswerSignal,
  };
}

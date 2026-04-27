/**
 * Direct Call Negotiation Dispatch Layer
 * 
 * Handles WebSocket dispatch for renegotiation offers and answers.
 * Separated from other negotiation concerns to improve testability.
 */

import type { MutableRefObject } from "react";
import { wsClient } from "@/lib/websocket";
import { logger } from "@/lib/logger.js";

export interface PendingRenegotiationOfferDispatch {
  callId: string;
  reason: string;
  revision: number;
  message: {
    type: "call.renegotiate.offer";
    callId: string;
    revision: number;
    sdp: string;
    auth: unknown;
  };
}

export interface PendingRenegotiationAnswerDispatch {
  callId: string;
  revision: number;
  message: {
    type: "call.renegotiate.answer";
    callId: string;
    revision: number;
    sdp: string;
    auth: unknown;
  };
}

export interface NegotiationDispatchCallbacks {
  isCurrentActiveCallContext: (callId: string, pc?: RTCPeerConnection | null) => boolean;
  pendingRenegotiationReasonRef: MutableRefObject<string | null>;
  lastSignalingErrorRef: MutableRefObject<Record<string, unknown> | null>;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  recordLastRenegotiationAttempt: (payload: Record<string, unknown>) => void;
}

export interface NegotiationDispatchState {
  pendingOutboundRenegotiationOfferRef: MutableRefObject<PendingRenegotiationOfferDispatch | null>;
  pendingOutboundRenegotiationAnswerRef: MutableRefObject<PendingRenegotiationAnswerDispatch | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
}

export function createNegotiationDispatch({
  callbacks,
  state,
}: {
  callbacks: NegotiationDispatchCallbacks;
  state: NegotiationDispatchState;
}) {
  const {
    isCurrentActiveCallContext,
    pendingRenegotiationReasonRef,
    lastSignalingErrorRef,
    debugCallMedia,
    recordLastRenegotiationAttempt,
  } = callbacks;

  const {
    pendingOutboundRenegotiationOfferRef,
    pendingOutboundRenegotiationAnswerRef,
    peerConnectionRef,
  } = state;

  /**
   * Dispatches a pending renegotiation offer over WebSocket.
   * Returns true if dispatch succeeded, false if deferred.
   */
  function dispatchPendingRenegotiationOffer(
    pendingOffer: PendingRenegotiationOfferDispatch,
    trigger: string
  ): boolean {
    const pc = peerConnectionRef.current;
    if (!isCurrentActiveCallContext(pendingOffer.callId, pc)) {
      pendingOutboundRenegotiationOfferRef.current = null;
      return false;
    }

    const dispatch = wsClient.send(pendingOffer.message);
    if (dispatch.status !== "sent") {
      pendingRenegotiationReasonRef.current = pendingOffer.reason;
      pendingOutboundRenegotiationOfferRef.current = pendingOffer;
      lastSignalingErrorRef.current = {
        type: pendingOffer.message.type,
        callId: pendingOffer.callId,
        revision: pendingOffer.revision,
        dispatchStatus: dispatch.status,
        trigger,
      };
      recordLastRenegotiationAttempt({
        callId: pendingOffer.callId,
        kind: "offer",
        reason: pendingOffer.reason,
        stage: "dispatch-deferred",
        revision: pendingOffer.revision,
        dispatchStatus: dispatch.status,
        trigger,
      });
      debugCallMedia("renegotiation-offer-dispatch-deferred", {
        callId: pendingOffer.callId,
        reason: pendingOffer.reason,
        revision: pendingOffer.revision,
        dispatchStatus: dispatch.status,
        trigger,
      });
      logger.warn("[CALL] renegotiation offer dispatch deferred until websocket reconnect", {
        callId: pendingOffer.callId,
        revision: pendingOffer.revision,
        dispatchStatus: dispatch.status,
        trigger,
      });
      return false;
    }

    pendingRenegotiationReasonRef.current = null;
    pendingOutboundRenegotiationOfferRef.current = null;
    lastSignalingErrorRef.current = null;
    recordLastRenegotiationAttempt({
      callId: pendingOffer.callId,
      kind: "offer",
      reason: pendingOffer.reason,
      stage: "sent",
      revision: pendingOffer.revision,
      trigger,
    });
    debugCallMedia("renegotiation-offer-sent", {
      callId: pendingOffer.callId,
      reason: pendingOffer.reason,
      revision: pendingOffer.revision,
      trigger,
    });
    return true;
  }

  /**
   * Dispatches a pending renegotiation answer over WebSocket.
   * Returns true if dispatch succeeded, false if deferred.
   */
  function dispatchPendingRenegotiationAnswer(
    pendingAnswer: PendingRenegotiationAnswerDispatch,
    trigger: string
  ): boolean {
    const pc = peerConnectionRef.current;
    if (!isCurrentActiveCallContext(pendingAnswer.callId, pc)) {
      pendingOutboundRenegotiationAnswerRef.current = null;
      return false;
    }

    const dispatch = wsClient.send(pendingAnswer.message);
    if (dispatch.status !== "sent") {
      pendingOutboundRenegotiationAnswerRef.current = pendingAnswer;
      lastSignalingErrorRef.current = {
        type: pendingAnswer.message.type,
        callId: pendingAnswer.callId,
        revision: pendingAnswer.revision,
        dispatchStatus: dispatch.status,
        trigger,
      };
      recordLastRenegotiationAttempt({
        callId: pendingAnswer.callId,
        kind: "answer",
        stage: "dispatch-deferred",
        revision: pendingAnswer.revision,
        dispatchStatus: dispatch.status,
        trigger,
      });
      debugCallMedia("renegotiation-answer-dispatch-deferred", {
        callId: pendingAnswer.callId,
        revision: pendingAnswer.revision,
        dispatchStatus: dispatch.status,
        trigger,
      });
      logger.warn("[CALL] renegotiation answer dispatch deferred until websocket reconnect", {
        callId: pendingAnswer.callId,
        revision: pendingAnswer.revision,
        dispatchStatus: dispatch.status,
        trigger,
      });
      return false;
    }

    pendingOutboundRenegotiationAnswerRef.current = null;
    lastSignalingErrorRef.current = null;
    recordLastRenegotiationAttempt({
      callId: pendingAnswer.callId,
      kind: "answer",
      stage: "sent",
      revision: pendingAnswer.revision,
      trigger,
    });
    debugCallMedia("renegotiation-answer-sent", {
      callId: pendingAnswer.callId,
      revision: pendingAnswer.revision,
      trigger,
    });
    return true;
  }

  return {
    dispatchPendingRenegotiationOffer,
    dispatchPendingRenegotiationAnswer,
  };
}

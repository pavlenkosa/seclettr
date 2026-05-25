import { useCallback, useEffect, type MutableRefObject } from "react";
import type {
  ActiveCall,
} from "@/calls/direct/model/direct-call-types";
import type {
  PendingRenegotiationAnswerDispatch,
  PendingRenegotiationOfferDispatch,
} from "@/calls/direct/runtime/direct-call-negotiation-dispatch";
import { wsClient } from "@/lib/websocket";

interface UseDirectCallPendingNegotiationRuntimeOptions {
  activeRef: MutableRefObject<ActiveCall | null>;
  pendingOutboundRenegotiationOfferRef: MutableRefObject<PendingRenegotiationOfferDispatch | null>;
  pendingOutboundRenegotiationAnswerRef: MutableRefObject<PendingRenegotiationAnswerDispatch | null>;
  pendingRenegotiationReasonRef: MutableRefObject<string | null>;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  dispatchPendingRenegotiationOffer: (
    pendingOffer: PendingRenegotiationOfferDispatch,
    trigger: string
  ) => void;
  dispatchPendingRenegotiationAnswer: (
    pendingAnswer: PendingRenegotiationAnswerDispatch,
    trigger: string
  ) => void;
  sendRenegotiationOffer: (callId: string, reason: string) => Promise<void>;
}

interface DirectCallPendingNegotiationRuntime {
  flushPendingRenegotiationOffer: (
    callId: string,
    trigger: string
  ) => Promise<void>;
}

/**
 * Owns pending renegotiation resend/flush behavior only: re-dispatching
 * queued offers/answers and replaying them on websocket reconnect.
 */
export function useDirectCallPendingNegotiationRuntime({
  activeRef,
  pendingOutboundRenegotiationOfferRef,
  pendingOutboundRenegotiationAnswerRef,
  pendingRenegotiationReasonRef,
  debugCallMedia,
  dispatchPendingRenegotiationOffer,
  dispatchPendingRenegotiationAnswer,
  sendRenegotiationOffer,
}: UseDirectCallPendingNegotiationRuntimeOptions): DirectCallPendingNegotiationRuntime {
  const flushPendingRenegotiationOffer = useCallback(
    async (callId: string, trigger: string) => {
      const pendingOffer = pendingOutboundRenegotiationOfferRef.current;
      if (pendingOffer?.callId === callId) {
        debugCallMedia("renegotiation-offer-resend", {
          callId,
          trigger,
          revision: pendingOffer.revision,
          reason: pendingOffer.reason,
        });
        dispatchPendingRenegotiationOffer(pendingOffer, trigger);
        return;
      }
      const pendingReason = pendingRenegotiationReasonRef.current;
      if (!pendingReason) return;
      debugCallMedia("renegotiation-offer-flush", {
        callId,
        trigger,
        pendingReason,
      });
      await sendRenegotiationOffer(callId, pendingReason);
    },
    [
      debugCallMedia,
      dispatchPendingRenegotiationOffer,
      pendingOutboundRenegotiationOfferRef,
      pendingRenegotiationReasonRef,
      sendRenegotiationOffer,
    ]
  );

  const flushPendingRenegotiationAnswer = useCallback(
    (callId: string, trigger: string) => {
      const pendingAnswer = pendingOutboundRenegotiationAnswerRef.current;
      if (pendingAnswer?.callId !== callId) return;
      debugCallMedia("renegotiation-answer-resend", {
        callId,
        trigger,
        revision: pendingAnswer.revision,
      });
      dispatchPendingRenegotiationAnswer(pendingAnswer, trigger);
    },
    [
      debugCallMedia,
      dispatchPendingRenegotiationAnswer,
      pendingOutboundRenegotiationAnswerRef,
    ]
  );

  useEffect(
    () =>
      wsClient.onConnectionChange((connected) => {
        if (!connected) return;
        const currentActive = activeRef.current;
        if (!currentActive?.callId) return;
        void flushPendingRenegotiationAnswer(
          currentActive.callId,
          "ws-reconnected"
        );
        void flushPendingRenegotiationOffer(
          currentActive.callId,
          "ws-reconnected"
        );
      }),
    [activeRef, flushPendingRenegotiationAnswer, flushPendingRenegotiationOffer]
  );

  return {
    flushPendingRenegotiationOffer,
  };
}

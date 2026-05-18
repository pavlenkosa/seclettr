import type { MutableRefObject } from "react";
import { createSignedCallRenegotiationOfferAuth } from "@/calls/direct/runtime/crypto/call-auth-actions";
import type { ActiveCall } from "@/calls/direct/model/direct-call-types";
import type { PendingRenegotiationOfferDispatch } from "@/calls/direct/runtime/direct-call-negotiation-dispatch";
import { logger } from "@/lib/logger.js";

interface DirectCallOutgoingNegotiationRuntimeOptions {
  activeRef: MutableRefObject<ActiveCall | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  renegotiationUnsupportedRef: MutableRefObject<boolean>;
  pendingRenegotiationReasonRef: MutableRefObject<string | null>;
  makingOfferRef: MutableRefObject<boolean>;
  renegotiationRevisionRef: MutableRefObject<number>;
  pendingLocalRenegotiationRevisionRef: MutableRefObject<number | null>;
  negotiationReadyRef: MutableRefObject<boolean>;
  lastSignalingErrorRef: MutableRefObject<Record<string, unknown> | null>;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  recordLastRenegotiationAttempt: (payload: Record<string, unknown>) => void;
  isCurrentActiveCallContext: (
    callId: string,
    pc?: RTCPeerConnection | null
  ) => boolean;
  syncVisualTransceiverDirections: (callId: string) => void;
  syncOutgoingVisualMediaStateTrackBindings: (
    callIdOverride?: string
  ) => void;
  dispatchPendingRenegotiationOffer: (
    pendingOffer: PendingRenegotiationOfferDispatch,
    trigger: string
  ) => void;
}

export interface DirectCallOutgoingNegotiationRuntime {
  sendRenegotiationOffer: (callId: string, reason: string) => Promise<void>;
}

/**
 * Owns the local outgoing renegotiation-offer phase only: readiness guards,
 * offer creation, local-description apply, signing, revision bookkeeping, and
 * pending-dispatch handoff.
 */
export function createDirectCallOutgoingNegotiationRuntime(
  options: DirectCallOutgoingNegotiationRuntimeOptions
): DirectCallOutgoingNegotiationRuntime {
  const {
    activeRef,
    peerConnectionRef,
    renegotiationUnsupportedRef,
    pendingRenegotiationReasonRef,
    makingOfferRef,
    renegotiationRevisionRef,
    pendingLocalRenegotiationRevisionRef,
    negotiationReadyRef,
    lastSignalingErrorRef,
    debugCallMedia,
    recordLastRenegotiationAttempt,
    isCurrentActiveCallContext,
    syncVisualTransceiverDirections,
    syncOutgoingVisualMediaStateTrackBindings,
    dispatchPendingRenegotiationOffer,
  } = options;

  async function sendRenegotiationOffer(
    callId: string,
    reason: string
  ): Promise<void> {
    const pc = peerConnectionRef.current;
    const currentActive = activeRef.current;
    if (!pc || currentActive?.callId !== callId) return;
    if (renegotiationUnsupportedRef.current) return;

    const deferOffer = (blockedBy: string) => {
      pendingRenegotiationReasonRef.current = reason;
      recordLastRenegotiationAttempt({
        callId,
        kind: "offer",
        reason,
        stage: "deferred",
        blockedBy,
        signalingState: pc.signalingState,
      });
      debugCallMedia("renegotiation-offer-deferred", {
        callId,
        reason,
        blockedBy,
        negotiationReady: negotiationReadyRef.current,
        peerUserId: currentActive.peerUserId,
        peerDeviceId: currentActive.peerDeviceId,
        signalingState: pc.signalingState,
        makingOffer: makingOfferRef.current,
      });
    };

    if (!negotiationReadyRef.current) {
      deferOffer("negotiation-not-ready");
      return;
    }
    if (!currentActive.peerUserId) {
      deferOffer("peer-target-unresolved");
      return;
    }
    if (makingOfferRef.current) {
      deferOffer("making-offer");
      return;
    }
    if (pc.signalingState !== "stable") {
      deferOffer("signaling-not-stable");
      return;
    }

    makingOfferRef.current = true;
    try {
      pendingRenegotiationReasonRef.current = null;
      syncVisualTransceiverDirections(callId);
      const nextRevision = renegotiationRevisionRef.current + 1;
      lastSignalingErrorRef.current = null;
      recordLastRenegotiationAttempt({
        callId,
        kind: "offer",
        reason,
        stage: "creating",
        revision: nextRevision,
        signalingState: pc.signalingState,
      });
      debugCallMedia("renegotiation-offer-created", {
        callId,
        reason,
        revision: nextRevision,
        signalingState: pc.signalingState,
      });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      syncOutgoingVisualMediaStateTrackBindings(callId);
      renegotiationRevisionRef.current = nextRevision;
      pendingLocalRenegotiationRevisionRef.current = nextRevision;
      recordLastRenegotiationAttempt({
        callId,
        kind: "offer",
        reason,
        stage: "local-description-set",
        revision: nextRevision,
        descriptionType: pc.localDescription?.type ?? offer.type,
      });
      debugCallMedia("local-description-set", {
        callId,
        kind: "renegotiation-offer",
        revision: nextRevision,
        type: pc.localDescription?.type ?? offer.type,
      });
      if (!offer.sdp) {
        recordLastRenegotiationAttempt({
          callId,
          kind: "offer",
          reason,
          stage: "failed",
          error: "empty-sdp",
          revision: nextRevision,
        });
        logger.warn(
          "[CALL] renegotiation offer aborted: createOffer returned empty SDP",
          { callId, revision: nextRevision }
        );
        pendingLocalRenegotiationRevisionRef.current = null;
        return;
      }
      const auth = await createSignedCallRenegotiationOfferAuth({
        callId,
        revision: nextRevision,
        recipientUserId: currentActive.peerUserId,
        sdp: offer.sdp,
      });
      if (!auth) {
        recordLastRenegotiationAttempt({
          callId,
          kind: "offer",
          reason,
          stage: "failed",
          error: "signing-failed",
          revision: nextRevision,
        });
        logger.warn(
          "[CALL] renegotiation offer aborted: failed to sign auth proof",
          { callId, revision: nextRevision }
        );
        pendingLocalRenegotiationRevisionRef.current = null;
        return;
      }
      if (!isCurrentActiveCallContext(callId, pc)) {
        recordLastRenegotiationAttempt({
          callId,
          kind: "offer",
          reason,
          stage: "aborted-stale",
          revision: nextRevision,
        });
        debugCallMedia("renegotiation-offer-aborted-stale", {
          callId,
          reason,
          revision: nextRevision,
        });
        pendingLocalRenegotiationRevisionRef.current = null;
        return;
      }

      dispatchPendingRenegotiationOffer(
        {
          callId,
          reason,
          revision: nextRevision,
          message: {
            type: "call.renegotiate.offer",
            callId,
            revision: nextRevision,
            sdp: offer.sdp,
            auth,
          },
        },
        "created"
      );
    } catch (error) {
      recordLastRenegotiationAttempt({
        callId,
        kind: "offer",
        reason,
        stage: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      logger.warn("[CALL] failed to send renegotiation offer", error);
    } finally {
      makingOfferRef.current = false;
    }
  }

  return {
    sendRenegotiationOffer,
  };
}

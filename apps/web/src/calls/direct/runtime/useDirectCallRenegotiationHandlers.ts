import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { CallSignalVerificationResult } from "@/calls/direct/runtime/crypto/call-auth-material";
import {
  createSignedCallRenegotiationAnswerAuth,
  verifyIncomingCallRenegotiationAnswer,
  verifyIncomingCallRenegotiationOffer,
} from "@/calls/direct/runtime/crypto/call-auth-actions";
import { useAuthStore } from "@/stores/auth";
import type { CallSecurityMode } from "@/ui-settings";
import {
  isStaleRenegotiationRevision,
  shouldIgnoreIncomingRenegotiationOffer,
  type DirectCallNegotiationRole,
} from "@/calls/direct/model/direct-call-lifecycle";
import type {
  ActiveCall,
  CallNotice,
  IncomingCallRenegotiationAnswerSignal,
  IncomingCallRenegotiationOfferSignal,
} from "@/calls/direct/model/direct-call-types";
import type {
  PendingRenegotiationAnswerDispatch,
  PendingRenegotiationOfferDispatch,
} from "@/calls/direct/runtime/direct-call-negotiation-dispatch";
import { logger } from "@/lib/logger.js";
import type { DirectCallTranslate, DirectCallPushNotice } from "./direct-call-runtime-types";

interface UseDirectCallRenegotiationHandlersOptions {
  activeRef: MutableRefObject<ActiveCall | null>;
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  supportsPeerRenegotiationV1Ref: MutableRefObject<boolean>;
  renegotiationUnsupportedRef: MutableRefObject<boolean>;
  pendingRenegotiationReasonRef: MutableRefObject<string | null>;
  makingOfferRef: MutableRefObject<boolean>;
  ignoreOfferRef: MutableRefObject<boolean>;
  isSettingRemoteAnswerPendingRef: MutableRefObject<boolean>;
  lastAppliedRemoteRenegotiationRevisionRef: MutableRefObject<number>;
  pendingLocalRenegotiationRevisionRef: MutableRefObject<number | null>;
  directCallNegotiationRoleRef: MutableRefObject<DirectCallNegotiationRole>;
  lastRenegotiationAttemptRef: MutableRefObject<Record<string, unknown> | null>;
  lastSignalingErrorRef: MutableRefObject<Record<string, unknown> | null>;
  pendingOutboundRenegotiationOfferRef: MutableRefObject<PendingRenegotiationOfferDispatch | null>;
  setActive: Dispatch<SetStateAction<ActiveCall | null>>;
  callSecurityMode: CallSecurityMode;
  debugCallMedia: (event: string, payload: Record<string, unknown>) => void;
  recordLastRenegotiationAttempt: (payload: Record<string, unknown>) => void;
  shouldIgnoreUnexpectedPeerSignal: (params: {
    callId: string;
    signalType: string;
    senderUserId?: string | null;
    senderDeviceId?: string | null;
    revision?: number;
    source?: string;
  }) => boolean;
  isCurrentActiveCallContext: (callId: string, pc?: RTCPeerConnection | null) => boolean;
  resetCallStateIfCurrent: (
    callId: string,
    opts?: { sendHangup?: boolean; notice?: CallNotice },
    pc?: RTCPeerConnection | null
  ) => boolean;
  syncVisualTransceiverBindings: () => void;
  syncVisualTransceiverDirections: (callId: string) => void;
  syncOutgoingVisualMediaStateTrackBindings: (callIdOverride?: string) => void;
  refreshRemoteVideoTracksFromPeer: (callIdOverride?: string, reason?: string) => void;
  applySignalVerificationResult: (callId: string, result: CallSignalVerificationResult) => void;
  applyCallSecurityState: (callId: string, pc: RTCPeerConnection) => Promise<void>;
  pushNotice: DirectCallPushNotice;
  t: DirectCallTranslate;
  dispatchPendingRenegotiationAnswer: (
    pendingAnswer: PendingRenegotiationAnswerDispatch,
    trigger: string
  ) => void;
}

export function useDirectCallRenegotiationHandlers({
  activeRef,
  peerConnectionRef,
  supportsPeerRenegotiationV1Ref,
  renegotiationUnsupportedRef,
  pendingRenegotiationReasonRef,
  makingOfferRef,
  ignoreOfferRef,
  isSettingRemoteAnswerPendingRef,
  lastAppliedRemoteRenegotiationRevisionRef,
  pendingLocalRenegotiationRevisionRef,
  directCallNegotiationRoleRef,
  lastRenegotiationAttemptRef,
  lastSignalingErrorRef,
  pendingOutboundRenegotiationOfferRef,
  setActive,
  callSecurityMode,
  debugCallMedia,
  recordLastRenegotiationAttempt,
  shouldIgnoreUnexpectedPeerSignal,
  isCurrentActiveCallContext,
  resetCallStateIfCurrent,
  syncVisualTransceiverBindings,
  syncVisualTransceiverDirections,
  syncOutgoingVisualMediaStateTrackBindings,
  refreshRemoteVideoTracksFromPeer,
  applySignalVerificationResult,
  applyCallSecurityState,
  pushNotice,
  t,
  dispatchPendingRenegotiationAnswer,
}: UseDirectCallRenegotiationHandlersOptions) {
  const markPeerRenegotiationSupport = useCallback((
    callId: string,
    senderUserId?: string | null,
    senderDeviceId?: string | null
  ) => {
    supportsPeerRenegotiationV1Ref.current = true;
    renegotiationUnsupportedRef.current = false;
    setActive((prev) => (
      prev?.callId === callId
        ? {
            ...prev,
            peerSupportsRenegotiationV1: true,
            peerDeviceId: senderDeviceId ?? prev.peerDeviceId,
            peerUserId: senderUserId ?? prev.peerUserId,
          }
        : prev
    ));
  }, [renegotiationUnsupportedRef, setActive, supportsPeerRenegotiationV1Ref]);

  const handleIncomingRenegotiationAnswer = useCallback(async (
    message: IncomingCallRenegotiationAnswerSignal
  ) => {
    const pc = peerConnectionRef.current;
    const currentActive = activeRef.current;
    if (!pc || currentActive?.callId !== message.callId) return;
    if (shouldIgnoreUnexpectedPeerSignal({
      callId: message.callId,
      signalType: "call.renegotiate.answer",
      senderUserId: message.senderUserId ?? null,
      senderDeviceId: message.senderDeviceId ?? null,
      revision: message.revision,
    })) {
      return;
    }
    markPeerRenegotiationSupport(
      message.callId,
      message.senderUserId ?? null,
      message.senderDeviceId ?? null
    );
    if (pendingLocalRenegotiationRevisionRef.current !== message.revision) {
      return;
    }

    const verification = await verifyIncomingCallRenegotiationAnswer(
      message,
      useAuthStore.getState().userId
    );
    if (!isCurrentActiveCallContext(message.callId, pc)) {
      return;
    }
    if (verification.state === "invalid") {
      if (callSecurityMode === "strict") {
        resetCallStateIfCurrent(message.callId, {
          sendHangup: true,
          notice: { kind: "error", message: t("call.error.unableVerifyCode") },
        }, pc);
        return;
      }
      applySignalVerificationResult(message.callId, { state: "unverified" });
      pushNotice({ kind: "error", message: t("call.error.unableVerifyCode") });
    } else {
      applySignalVerificationResult(message.callId, verification);
    }
    if (!isCurrentActiveCallContext(message.callId, pc)) {
      return;
    }

    isSettingRemoteAnswerPendingRef.current = true;
    try {
      await pc.setRemoteDescription({ type: "answer", sdp: message.sdp });
      syncVisualTransceiverBindings();
      refreshRemoteVideoTracksFromPeer(message.callId, "renegotiation-answer");
      debugCallMedia("remote-description-set", {
        callId: message.callId,
        kind: "renegotiation-answer",
        revision: message.revision,
      });
    } finally {
      isSettingRemoteAnswerPendingRef.current = false;
      pendingLocalRenegotiationRevisionRef.current = null;
      pendingOutboundRenegotiationOfferRef.current = null;
      pendingRenegotiationReasonRef.current = null;
      lastSignalingErrorRef.current = null;
    }
    if (!isCurrentActiveCallContext(message.callId, pc)) {
      return;
    }
    recordLastRenegotiationAttempt({
      callId: message.callId,
      kind: "offer",
      reason:
        typeof lastRenegotiationAttemptRef.current?.reason === "string"
          ? lastRenegotiationAttemptRef.current.reason
          : null,
      stage: "completed",
      revision: message.revision,
    });
    await applyCallSecurityState(message.callId, pc);
  }, [
    activeRef,
    applyCallSecurityState,
    applySignalVerificationResult,
    callSecurityMode,
    debugCallMedia,
    isCurrentActiveCallContext,
    isSettingRemoteAnswerPendingRef,
    lastRenegotiationAttemptRef,
    lastSignalingErrorRef,
    markPeerRenegotiationSupport,
    peerConnectionRef,
    pendingLocalRenegotiationRevisionRef,
    pendingOutboundRenegotiationOfferRef,
    pendingRenegotiationReasonRef,
    pushNotice,
    recordLastRenegotiationAttempt,
    refreshRemoteVideoTracksFromPeer,
    resetCallStateIfCurrent,
    shouldIgnoreUnexpectedPeerSignal,
    syncVisualTransceiverBindings,
    t,
  ]);

  const handleIncomingRenegotiationOffer = useCallback(async (
    message: IncomingCallRenegotiationOfferSignal
  ) => {
    const pc = peerConnectionRef.current;
    const currentActive = activeRef.current;
    if (!pc || currentActive?.callId !== message.callId) return;
    if (shouldIgnoreUnexpectedPeerSignal({
      callId: message.callId,
      signalType: "call.renegotiate.offer",
      senderUserId: message.senderUserId ?? null,
      senderDeviceId: message.senderDeviceId ?? null,
      revision: message.revision,
    })) {
      return;
    }
    markPeerRenegotiationSupport(
      message.callId,
      message.senderUserId ?? null,
      message.senderDeviceId ?? null
    );
    if (isStaleRenegotiationRevision(lastAppliedRemoteRenegotiationRevisionRef.current, message.revision)) {
      return;
    }

    const ignoreOffer = shouldIgnoreIncomingRenegotiationOffer({
      role: directCallNegotiationRoleRef.current,
      makingOffer: makingOfferRef.current,
      signalingState: pc.signalingState,
      isSettingRemoteAnswerPending: isSettingRemoteAnswerPendingRef.current,
    });
    ignoreOfferRef.current = ignoreOffer;
    if (ignoreOffer) {
      debugCallMedia("renegotiation-offer-ignored", {
        callId: message.callId,
        revision: message.revision,
        signalingState: pc.signalingState,
      });
      return;
    }

    const verification = await verifyIncomingCallRenegotiationOffer(
      message,
      useAuthStore.getState().userId
    );
    if (!isCurrentActiveCallContext(message.callId, pc)) {
      return;
    }
    if (verification.state === "invalid") {
      if (callSecurityMode === "strict") {
        resetCallStateIfCurrent(message.callId, {
          sendHangup: true,
          notice: { kind: "error", message: t("call.error.unableVerifyCode") },
        }, pc);
        return;
      }
      applySignalVerificationResult(message.callId, { state: "unverified" });
      pushNotice({ kind: "error", message: t("call.error.unableVerifyCode") });
    } else {
      applySignalVerificationResult(message.callId, verification);
    }
    if (!isCurrentActiveCallContext(message.callId, pc)) {
      return;
    }

    lastAppliedRemoteRenegotiationRevisionRef.current = message.revision;
    pendingLocalRenegotiationRevisionRef.current = null;
    pendingRenegotiationReasonRef.current = null;
    pendingOutboundRenegotiationOfferRef.current = null;
    lastSignalingErrorRef.current = null;
    recordLastRenegotiationAttempt({
      callId: message.callId,
      kind: "answer",
      stage: "remote-offer-received",
      revision: message.revision,
      senderUserId: message.senderUserId,
      senderDeviceId: message.senderDeviceId,
    });
    await pc.setRemoteDescription({ type: "offer", sdp: message.sdp });
    refreshRemoteVideoTracksFromPeer(message.callId, "renegotiation-offer");
    debugCallMedia("remote-description-set", {
      callId: message.callId,
      kind: "renegotiation-offer",
      revision: message.revision,
    });
    syncVisualTransceiverDirections(message.callId);
    syncVisualTransceiverBindings();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    syncOutgoingVisualMediaStateTrackBindings(message.callId);
    refreshRemoteVideoTracksFromPeer(message.callId, "renegotiation-answer-local-description");
    recordLastRenegotiationAttempt({
      callId: message.callId,
      kind: "answer",
      stage: "local-description-set",
      revision: message.revision,
      descriptionType: answer.type,
    });
    debugCallMedia("renegotiation-answer-created", {
      callId: message.callId,
      revision: message.revision,
      type: answer.type,
    });
    if (!answer.sdp) {
      recordLastRenegotiationAttempt({
        callId: message.callId,
        kind: "answer",
        stage: "failed",
        error: "empty-sdp",
        revision: message.revision,
      });
      logger.warn("[CALL] renegotiation answer aborted: createAnswer returned empty SDP", { callId: message.callId, revision: message.revision });
      return;
    }
    const auth = await createSignedCallRenegotiationAnswerAuth({
      callId: message.callId,
      revision: message.revision,
      recipientUserId: currentActive.peerUserId,
      sdp: answer.sdp,
    });
    if (!auth) {
      recordLastRenegotiationAttempt({
        callId: message.callId,
        kind: "answer",
        stage: "failed",
        error: "signing-failed",
        revision: message.revision,
      });
      logger.warn("[CALL] renegotiation answer aborted: failed to sign auth proof", { callId: message.callId, revision: message.revision });
      return;
    }
    if (!isCurrentActiveCallContext(message.callId, pc)) {
      recordLastRenegotiationAttempt({
        callId: message.callId,
        kind: "answer",
        stage: "aborted-stale",
        revision: message.revision,
      });
      debugCallMedia("renegotiation-answer-aborted-stale", {
        callId: message.callId,
        revision: message.revision,
      });
      return;
    }
    dispatchPendingRenegotiationAnswer({
      callId: message.callId,
      revision: message.revision,
      message: {
        type: "call.renegotiate.answer",
        callId: message.callId,
        revision: message.revision,
        sdp: answer.sdp,
        auth,
      },
    }, "created");
    await applyCallSecurityState(message.callId, pc);
  }, [
    activeRef,
    applyCallSecurityState,
    applySignalVerificationResult,
    callSecurityMode,
    debugCallMedia,
    directCallNegotiationRoleRef,
    dispatchPendingRenegotiationAnswer,
    ignoreOfferRef,
    isCurrentActiveCallContext,
    isSettingRemoteAnswerPendingRef,
    lastAppliedRemoteRenegotiationRevisionRef,
    lastSignalingErrorRef,
    makingOfferRef,
    markPeerRenegotiationSupport,
    peerConnectionRef,
    pendingLocalRenegotiationRevisionRef,
    pendingOutboundRenegotiationOfferRef,
    pendingRenegotiationReasonRef,
    pushNotice,
    recordLastRenegotiationAttempt,
    refreshRemoteVideoTracksFromPeer,
    resetCallStateIfCurrent,
    shouldIgnoreUnexpectedPeerSignal,
    syncOutgoingVisualMediaStateTrackBindings,
    syncVisualTransceiverBindings,
    syncVisualTransceiverDirections,
    t,
  ]);

  return {
    handleIncomingRenegotiationAnswer,
    handleIncomingRenegotiationOffer,
  };
}

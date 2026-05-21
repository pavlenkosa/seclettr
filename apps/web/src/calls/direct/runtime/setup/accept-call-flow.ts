/**
 * Inbound call acceptance flow — extracted from useDirectCallSetupControlRuntime.
 *
 * runAcceptCallFlow is a pure async function; it has no React hook dependencies.
 * All side-effect surfaces are injected via AcceptCallFlowOptions.
 */

import {
  DIRECT_CALL_SETUP_TIMEOUTS,
} from "@/calls/direct/model/direct-call-setup-timeouts";
import {
  type DirectCallMediaEncryptionMode,
} from "@/calls/direct/model/call-media-encryption-negotiation";
import { beginDirectCallLifecycleToken } from "@/calls/direct/model/direct-call-lifecycle";
import { toMediaErrorMessage } from "@/calls/direct/model/direct-call-ui-utils";
import { finalizeAcceptedIncomingCallAnswer } from "./accept-call-answer-runtime";
import { prepareInboundOfferAcceptance } from "./accept-call-offer-runtime";
import { bootstrapAcceptedIncomingCall } from "./accept-call-media-runtime";
import {
  type DirectCallSetupRuntimeOptions,
  resetNegotiationSessionState,
} from "./direct-call-setup-shared";
import {
  DirectCallLifecycleAbortError,
  isDirectCallLifecycleAbortError,
  createLifecycleGuard,
  stopMediaStream,
} from "./call-setup-utils";

// ---------------------------------------------------------------------------
// Local helpers (accept-flow only)
// ---------------------------------------------------------------------------

const rejectInboundSetup = (params: {
  finishCallSession: DirectCallSetupRuntimeOptions["finishCallSession"];
  callId: string;
  t: DirectCallSetupRuntimeOptions["t"];
  reasonKey?: string;
}) => {
  params.finishCallSession({
    reason: "setup-failed",
    authority: "reject",
    callId: params.callId,
    notice: { kind: "error", message: params.t(params.reasonKey ?? "call.error.unableStart") },
  });
};

// ---------------------------------------------------------------------------
// AcceptCallFlowOptions
// ---------------------------------------------------------------------------

export interface AcceptCallFlowOptions
  extends Pick<
    DirectCallSetupRuntimeOptions,
    // Session
    | "incomingRef"
    | "acceptingIncomingCallRef"
    | "directCallLifecycleTokenRef"
    | "outgoingRingingTimeoutRef"
    | "commitIncomingState"
    | "commitActiveState"
    | "setIsMinimized"
    // Negotiation
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
    // Transport
    | "peerConnectionRef"
    | "pendingIceCandidatesRef"
    | "incomingIceCandidatesRef"
    // Media
    | "createPeerConnection"
    | "ensureVideoSenders"
    | "requestLocalStream"
    | "attachLocalTracksToPeer"
    | "syncVisualTransceiverBindings"
    | "syncVisualTransceiverDirections"
    | "syncOutgoingVisualMediaStateTrackBindings"
    | "refreshRemoteVideoTracksFromPeer"
    // Crypto
    | "callSecurityMode"
    | "resolveLocalSupportedMediaEncryptionModes"
    | "configureDirectCallFrameCrypto"
    | "prepareLocalEphemeralKey"
    | "setPeerEphemeralPublicKey"
    | "applyCallSecurityState"
    // Callbacks
    | "clearNotice"
    | "pushNotice"
    | "debugCallMedia"
    | "finishCallSession"
    | "recordCallEvent"
    | "t"
  > {}

// ---------------------------------------------------------------------------
// runAcceptCallFlow
// ---------------------------------------------------------------------------

export async function runAcceptCallFlow(options: AcceptCallFlowOptions): Promise<void> {
  const {
    incomingRef,
    acceptingIncomingCallRef,
    directCallLifecycleTokenRef,
    outgoingRingingTimeoutRef,
    commitIncomingState,
    commitActiveState,
    setIsMinimized,
    directCallNegotiationRoleRef,
    supportsPeerRenegotiationV1Ref,
    renegotiationUnsupportedRef,
    negotiationReadyRef,
    makingOfferRef,
    ignoreOfferRef,
    isSettingRemoteAnswerPendingRef,
    renegotiationRevisionRef,
    lastAppliedRemoteRenegotiationRevisionRef,
    pendingLocalRenegotiationRevisionRef,
    peerConnectionRef,
    pendingIceCandidatesRef,
    incomingIceCandidatesRef,
    createPeerConnection,
    ensureVideoSenders,
    requestLocalStream,
    attachLocalTracksToPeer,
    syncVisualTransceiverBindings,
    syncVisualTransceiverDirections,
    syncOutgoingVisualMediaStateTrackBindings,
    refreshRemoteVideoTracksFromPeer,
    callSecurityMode,
    resolveLocalSupportedMediaEncryptionModes,
    configureDirectCallFrameCrypto,
    prepareLocalEphemeralKey,
    setPeerEphemeralPublicKey,
    applyCallSecurityState,
    clearNotice,
    pushNotice,
    debugCallMedia,
    finishCallSession,
    recordCallEvent,
    t,
  } = options;

  const currentIncoming = incomingRef.current;
  if (!currentIncoming) {
    return;
  }
  if (outgoingRingingTimeoutRef.current !== null) {
    clearTimeout(outgoingRingingTimeoutRef.current);
    outgoingRingingTimeoutRef.current = null;
  }
  const lifecycleToken = beginDirectCallLifecycleToken(directCallLifecycleTokenRef.current);
  directCallLifecycleTokenRef.current = lifecycleToken;
  const ensureCurrentLifecycle = createLifecycleGuard({
    lifecycleToken,
    directCallLifecycleTokenRef,
  });

  const {
    callId,
    callerUserId,
    callerLabel,
    callType,
    offerSdp,
    mediaEncryptionOffer,
  } = currentIncoming;
  // Keep runtime ownership of the accepted call while the incoming UI state is hidden.
  // Late hangup/ICE can arrive before activeRef exists, and must still have a session target.
  acceptingIncomingCallRef.current = currentIncoming;
  commitIncomingState(null);

  try {
    resetNegotiationSessionState("inbound", currentIncoming.supportsRenegotiationV1, {
      directCallNegotiationRoleRef,
      supportsPeerRenegotiationV1Ref,
      renegotiationUnsupportedRef,
      negotiationReadyRef,
      makingOfferRef,
      ignoreOfferRef,
      isSettingRemoteAnswerPendingRef,
      renegotiationRevisionRef,
      lastAppliedRemoteRenegotiationRevisionRef,
      pendingLocalRenegotiationRevisionRef,
    });

    const inboundOfferAcceptance = await prepareInboundOfferAcceptance({
      currentIncoming,
      callSecurityMode,
      resolveLocalSupportedMediaEncryptionModes,
      finishCallSession,
      pushNotice,
      t,
      rejectInboundSetup,
    });
    if (!inboundOfferAcceptance) {
      return;
    }
    const {
      offerVerification,
      localSupportedMediaEncryptionModes,
      selectedMediaEncryptionMode,
    } = inboundOfferAcceptance;

    let resolvedMediaEncryptionMode: DirectCallMediaEncryptionMode = selectedMediaEncryptionMode;
    const mediaEncryptionAnswer: {
      selectedMode: DirectCallMediaEncryptionMode;
      supportedModes: readonly DirectCallMediaEncryptionMode[];
      ephemeralPublicKey?: string;
    } = {
      selectedMode: resolvedMediaEncryptionMode,
      supportedModes: localSupportedMediaEncryptionModes,
    };

    const { pc, stream } = await bootstrapAcceptedIncomingCall({
      currentIncoming,
      offerVerificationState: offerVerification.state,
      resolvedMediaEncryptionMode,
      acceptingIncomingCallRef,
      peerConnectionRef,
      commitActiveState,
      setIsMinimized,
      clearNotice,
      createPeerConnection,
      ensureVideoSenders,
      requestLocalStream,
      attachLocalTracksToPeer,
      syncVisualTransceiverBindings,
      syncVisualTransceiverDirections,
      syncOutgoingVisualMediaStateTrackBindings,
      refreshRemoteVideoTracksFromPeer,
      debugCallMedia,
      ensureCurrentLifecycle,
    });

    ensureCurrentLifecycle(() => {
      stopMediaStream(stream);
      pc.close();
    });

    const finalizedIncomingAnswer = await finalizeAcceptedIncomingCallAnswer({
      callId,
      callerUserId,
      callerDeviceId: currentIncoming.callerDeviceId ?? null,
      selectedMediaEncryptionMode,
      resolvedMediaEncryptionMode,
      localSupportedMediaEncryptionModes,
      mediaEncryptionOfferEphemeralPublicKey: currentIncoming.mediaEncryptionOffer.ephemeralPublicKey,
      callSecurityMode,
      pc,
      pendingIceCandidatesRef,
      incomingIceCandidatesRef,
      configureDirectCallFrameCrypto,
      commitActiveState,
      pushNotice,
      t,
      setPeerEphemeralPublicKey,
      prepareLocalEphemeralKey,
      syncVisualTransceiverBindings,
      syncOutgoingVisualMediaStateTrackBindings,
      refreshRemoteVideoTracksFromPeer,
      debugCallMedia,
      applyCallSecurityState,
      negotiationReadyRef,
      ensureCurrentLifecycle,
    });
    resolvedMediaEncryptionMode = finalizedIncomingAnswer.resolvedMediaEncryptionMode;
    if (!finalizedIncomingAnswer.ok) {
      rejectInboundSetup({ finishCallSession, callId, t });
      return;
    }
  } catch (error) {
    if (isDirectCallLifecycleAbortError(error)) {
      return;
    }
    finishCallSession({
      reason: "setup-failed",
      authority: "reject",
      callId,
      notice: { kind: "error", message: toMediaErrorMessage(error, "audio", t) },
      onBeforeReset: () => {
        recordCallEvent({
          userId: callerUserId,
          fallbackLabel: callerLabel,
          mode: callType,
          direction: "inbound",
          outcome: "declined",
        });
      },
    });
  }
}

/**
 * useDirectCallSetup — call setup state machine entry point.
 *
 * Owns:
 *   - startCall: initiates an outgoing call (media acquisition → offer → invite API)
 *   - acceptCall: accepts an incoming call (media acquisition → answer → connect)
 *   - rejectCall: rejects an incoming call without setting up media
 *   - hangup: terminates the active call and tears down peer-connection
 *
 * Delegates each flow to runStartCallFlow / runAcceptCallFlow in the setup/
 * subdirectory. Does not own negotiation runtime ordering, signal ingress,
 * media controls, or frame-crypto lifecycle beyond initial call setup.
 */
import { useCallback } from "react";
import {
  resolveDirectCallDurationSeconds,
} from "@/calls/direct/model/direct-call-lifecycle";
import {
  type CallType,
} from "@/calls/direct/model/direct-call-types";
import {
  type DirectCallSetupRuntimeOptions,
  runAcceptCallFlow,
  runStartCallFlow,
} from "./setup";
import { hapticImpactMedium, hapticNotificationWarning } from "@/lib/native-haptics";

export function useDirectCallSetup(options: DirectCallSetupRuntimeOptions) {
  const {
    // --- DirectCallSetupSessionContext ---
    activeRef,
    incomingRef,
    acceptingIncomingCallRef,
    directCallLifecycleTokenRef,
    outgoingRingingTimeoutRef,
    commitIncomingState,
    commitActiveState,
    setIsMinimized,
    // --- DirectCallSetupNegotiationContext ---
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
    outboundMediaEncryptionOfferRef,
    // --- DirectCallSetupTransportContext ---
    peerConnectionRef,
    pendingIceCandidatesRef,
    incomingIceCandidatesRef,
    // --- DirectCallSetupMediaContext ---
    createPeerConnection,
    ensureVideoSenders,
    requestLocalStream,
    attachLocalTracksToPeer,
    syncVisualTransceiverBindings,
    syncVisualTransceiverDirections,
    syncOutgoingVisualMediaStateTrackBindings,
    refreshRemoteVideoTracksFromPeer,
    // --- DirectCallSetupCryptoContext ---
    callSecurityMode,
    resolveLocalSupportedMediaEncryptionModes,
    primeDirectCallSenderFrameCrypto,
    closeDirectCallFrameCrypto,
    configureDirectCallFrameCrypto,
    prepareLocalEphemeralKey,
    setPeerEphemeralPublicKey,
    applyCallSecurityState,
    // --- DirectCallSetupCallbackContext ---
    clearNotice,
    ensureConversationUsername,
    resolvePeerLabel,
    pushNotice,
    callChatKindRef,
    debugCallMedia,
    finishCallSession,
    recordCallEvent,
    t,
  } = options;

  const startCall = useCallback(async (peerUserId: string, callType: CallType, peerLabel?: string, chatKind?: "plain" | "e2ee") => {
    await runStartCallFlow(peerUserId, callType, peerLabel, {
      activeRef,
      incomingRef,
      directCallLifecycleTokenRef,
      outgoingRingingTimeoutRef,
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
      outboundMediaEncryptionOfferRef,
      peerConnectionRef,
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
      primeDirectCallSenderFrameCrypto,
      closeDirectCallFrameCrypto,
      prepareLocalEphemeralKey,
      clearNotice,
      ensureConversationUsername,
      resolvePeerLabel,
      pushNotice,
      callChatKindRef,
      chatKind,
      debugCallMedia,
      finishCallSession,
      recordCallEvent,
      t,
    });
  }, [
    activeRef,
    attachLocalTracksToPeer,
    callChatKindRef,
    callSecurityMode,
    clearNotice,
    closeDirectCallFrameCrypto,
    commitActiveState,
    createPeerConnection,
    debugCallMedia,
    directCallLifecycleTokenRef,
    directCallNegotiationRoleRef,
    ensureConversationUsername,
    ensureVideoSenders,
    ignoreOfferRef,
    incomingRef,
    isSettingRemoteAnswerPendingRef,
    lastAppliedRemoteRenegotiationRevisionRef,
    makingOfferRef,
    negotiationReadyRef,
    outboundMediaEncryptionOfferRef,
    peerConnectionRef,
    pendingLocalRenegotiationRevisionRef,
    primeDirectCallSenderFrameCrypto,
    pushNotice,
    recordCallEvent,
    refreshRemoteVideoTracksFromPeer,
    renegotiationRevisionRef,
    renegotiationUnsupportedRef,
    requestLocalStream,
    resolveLocalSupportedMediaEncryptionModes,
    prepareLocalEphemeralKey,
    resolvePeerLabel,
    setIsMinimized,
    supportsPeerRenegotiationV1Ref,
    syncOutgoingVisualMediaStateTrackBindings,
    syncVisualTransceiverBindings,
    syncVisualTransceiverDirections,
    t,
    finishCallSession,
  ]);

  const acceptCall = useCallback(async () => {
    hapticImpactMedium();
    await runAcceptCallFlow({
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
    });
  }, [
    applyCallSecurityState,
    attachLocalTracksToPeer,
    acceptingIncomingCallRef,
    callSecurityMode,
    clearNotice,
    commitActiveState,
    commitIncomingState,
    configureDirectCallFrameCrypto,
    createPeerConnection,
    debugCallMedia,
    directCallLifecycleTokenRef,
    directCallNegotiationRoleRef,
    ensureVideoSenders,
    ignoreOfferRef,
    incomingIceCandidatesRef,
    incomingRef,
    isSettingRemoteAnswerPendingRef,
    lastAppliedRemoteRenegotiationRevisionRef,
    makingOfferRef,
    negotiationReadyRef,
    peerConnectionRef,
    pendingIceCandidatesRef,
    pendingLocalRenegotiationRevisionRef,
    pushNotice,
    recordCallEvent,
    refreshRemoteVideoTracksFromPeer,
    renegotiationRevisionRef,
    renegotiationUnsupportedRef,
    requestLocalStream,
    resolveLocalSupportedMediaEncryptionModes,
    prepareLocalEphemeralKey,
    setPeerEphemeralPublicKey,
    setIsMinimized,
    supportsPeerRenegotiationV1Ref,
    syncOutgoingVisualMediaStateTrackBindings,
    syncVisualTransceiverBindings,
    syncVisualTransceiverDirections,
    t,
    finishCallSession,
  ]);

  const rejectCall = useCallback(() => {
    const currentIncoming = incomingRef.current;
    if (!currentIncoming) {
      return;
    }
    hapticNotificationWarning();
    finishCallSession({
      reason: "local-reject",
      authority: "reject",
      callId: currentIncoming.callId,
      notice: { kind: "info", message: t("call.notice.declined") },
      onBeforeReset: () => {
        recordCallEvent({
          userId: currentIncoming.callerUserId,
          fallbackLabel: currentIncoming.callerLabel,
          mode: currentIncoming.callType,
          direction: "inbound",
          outcome: "declined",
          chatKind: callChatKindRef.current ?? undefined,
        });
      },
    });
  }, [
    callChatKindRef,
    incomingRef,
    recordCallEvent,
    t,
    finishCallSession,
  ]);

  const hangup = useCallback(() => {
    const currentActive = activeRef.current;
    finishCallSession({
      reason: "local-hangup",
      authority: "hangup",
      notice: { kind: "info", message: t("call.notice.ended") },
      onBeforeReset: () => {
        if (!currentActive) {
          return;
        }
        recordCallEvent({
          userId: currentActive.peerUserId,
          fallbackLabel: currentActive.peerLabel,
          mode: currentActive.callType,
          direction: currentActive.direction,
          outcome: "ended",
          durationSec: resolveDirectCallDurationSeconds(currentActive),
          chatKind: callChatKindRef.current ?? undefined,
        });
      },
    });
  }, [activeRef, callChatKindRef, recordCallEvent, t, finishCallSession]);

  return {
    startCall,
    acceptCall,
    rejectCall,
    hangup,
  };
}

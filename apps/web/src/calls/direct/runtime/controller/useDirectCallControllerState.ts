import {
  useCallback,
  type SetStateAction,
} from "react";
import { logger } from "@/lib/logger.js";

import {
  isCurrentDirectCallContext,
  resolveExpectedDirectCallSignalSender,
  updateDirectCallIfCurrent,
} from "@/calls/direct/model/call-signal-guard";
import { useDirectCallSurfaceDragging } from "../presentation";
import { useDirectCallMutableRefs } from "./useDirectCallMutableRefs";
import { useDirectCallReactiveState } from "./useDirectCallReactiveState";
import type {
  ActiveCall,
  IncomingCall,
} from "@/calls/direct/model/direct-call-types";

function applySetStateAction<T>(current: T, action: SetStateAction<T>): T {
  return typeof action === "function" ? (action as (prev: T) => T)(current) : action;
}

export function useDirectCallControllerState() {
  const {
    state: {
      incoming,
      active,
      notice,
      isMinimized,
      isSecurityCardOpen,
    },
    setIncoming,
    setActive,
    setNotice,
    setIsMinimized,
    setIsSecurityCardOpen,
  } = useDirectCallReactiveState();

  const refs = useDirectCallMutableRefs();

  const dragging = useDirectCallSurfaceDragging({
    isMinimized,
    minimizedDockRef: refs.minimizedDockRef,
    localPreviewShellRef: refs.localPreviewShellRef,
    localScreenPreviewShellRef: refs.localScreenPreviewShellRef,
  });

  const commitIncomingState = useCallback((next: SetStateAction<IncomingCall | null>) => {
    const value = applySetStateAction(refs.incomingRef.current, next);
    refs.incomingRef.current = value;
    setIncoming(value);
  }, []);

  const commitActiveState = useCallback((next: SetStateAction<ActiveCall | null>) => {
    const value = applySetStateAction(refs.activeRef.current, next);
    refs.activeRef.current = value;
    setActive(value);
  }, []);

  const debugCallMedia = useCallback((event: string, payload: Record<string, unknown>) => {
    if (!import.meta.env.DEV || !refs.callMediaDebugEnabledRef.current) {
      return;
    }
    logger.debug(`[CALL][${event}]`, payload);
  }, []);

  const recordLastRenegotiationAttempt = useCallback((payload: Record<string, unknown>) => {
    refs.lastRenegotiationAttemptRef.current = {
      ...payload,
      at: new Date().toISOString(),
    };
  }, []);

  const shouldIgnoreUnexpectedPeerSignal = useCallback((params: {
    callId: string;
    signalType: string;
    senderUserId?: string | null;
    senderDeviceId?: string | null;
    revision?: number;
    source?: string;
  }) => {
    const currentActive = refs.activeRef.current;
    const expectation = resolveExpectedDirectCallSignalSender({
      active: currentActive,
      callId: params.callId,
      senderUserId: params.senderUserId,
      senderDeviceId: params.senderDeviceId,
    });
    if (expectation.ok || expectation.reason === "call_mismatch") {
      return false;
    }

    const errorPayload = {
      code: "UNEXPECTED_SIGNAL_SENDER",
      callId: params.callId,
      signalType: params.signalType,
      revision: params.revision ?? null,
      source: params.source ?? null,
      senderUserId: params.senderUserId ?? null,
      senderDeviceId: params.senderDeviceId ?? null,
      expectedPeerUserId: currentActive?.peerUserId ?? null,
      expectedPeerDeviceId: currentActive?.peerDeviceId ?? null,
      reason: expectation.reason,
    };
    refs.lastSignalingErrorRef.current = {
      ...errorPayload,
      at: new Date().toISOString(),
    };
    debugCallMedia("unexpected-peer-signal-ignored", errorPayload);
    return true;
  }, [debugCallMedia]);

  const isCurrentActiveCallContext = useCallback((callId: string, pc?: RTCPeerConnection | null) => {
    return isCurrentDirectCallContext({
      activeCallId: refs.activeRef.current?.callId,
      expectedCallId: callId,
      currentConnection: refs.peerConnectionRef.current,
      expectedConnection: pc,
    });
  }, []);

  const setActiveIfCurrent = useCallback((
    callId: string,
    update: (current: ActiveCall) => ActiveCall
  ) => {
    commitActiveState((prev) => updateDirectCallIfCurrent(prev, callId, update));
  }, [commitActiveState]);

  const sessionState = {
    incoming,
    active,
    incomingRef: refs.incomingRef,
    acceptingIncomingCallRef: refs.acceptingIncomingCallRef,
    activeRef: refs.activeRef,
    callChatKindRef: refs.callChatKindRef,
    commitIncomingState,
    commitActiveState,
    isCurrentActiveCallContext,
    setActiveIfCurrent,
    directCallLifecycleTokenRef: refs.directCallLifecycleTokenRef,
    outgoingRingingTimeoutRef: refs.outgoingRingingTimeoutRef,
  };

  const presentationState = {
    notice,
    isMinimized,
    isSecurityCardOpen,
    setNotice,
    setIsMinimized,
    setIsSecurityCardOpen,
    localPreviewShellRef: refs.localPreviewShellRef,
    localScreenPreviewShellRef: refs.localScreenPreviewShellRef,
    minimizedDockRef: refs.minimizedDockRef,
    incomingOverlayRef: refs.incomingOverlayRef,
    activeOverlayRef: refs.activeOverlayRef,
    incomingAcceptButtonRef: refs.incomingAcceptButtonRef,
    incomingMinimizedAcceptButtonRef: refs.incomingMinimizedAcceptButtonRef,
    incomingMinimizedSummaryRef: refs.incomingMinimizedSummaryRef,
    activeMinimizedSummaryRef: refs.activeMinimizedSummaryRef,
    activeHangupButtonRef: refs.activeHangupButtonRef,
    noticeTimerRef: refs.noticeTimerRef,
    incomingRingtoneRef: refs.incomingRingtoneRef,
    outgoingRingtoneRef: refs.outgoingRingtoneRef,
    ...dragging,
  };

  const mediaState = {
    localVideoRef: refs.localVideoRef,
    localScreenPreviewRef: refs.localScreenPreviewRef,
    remoteCameraPlaybackRef: refs.remoteCameraPlaybackRef,
    remoteScreenPlaybackRef: refs.remoteScreenPlaybackRef,
    remoteInboundVideoProgressRef: refs.remoteInboundVideoProgressRef,
    callMediaStateSeqRef: refs.callMediaStateSeqRef,
    localMediaStateRevisionRef: refs.localMediaStateRevisionRef,
    remoteMediaStateSeqRef: refs.remoteMediaStateSeqRef,
    remoteMediaStateRevisionRef: refs.remoteMediaStateRevisionRef,
    lastIncomingMediaStateRef: refs.lastIncomingMediaStateRef,
    localStreamRef: refs.localStreamRef,
    cameraSenderRef: refs.cameraSenderRef,
    cameraTransceiverRef: refs.cameraTransceiverRef,
    screenShareTrackRef: refs.screenShareTrackRef,
    screenShareSenderRef: refs.screenShareSenderRef,
    screenShareTransceiverRef: refs.screenShareTransceiverRef,
    localScreenPreviewStreamRef: refs.localScreenPreviewStreamRef,
    directCallFrameCryptoStateRef: refs.directCallFrameCryptoStateRef,
    directCallSenderFrameHandlesRef: refs.directCallSenderFrameHandlesRef,
    directCallReceiverFrameHandlesRef: refs.directCallReceiverFrameHandlesRef,
    frameModeRecoveryTimerRef: refs.frameModeRecoveryTimerRef,
    frameModeRecoveryAttemptedCallIdRef: refs.frameModeRecoveryAttemptedCallIdRef,
    syncOutgoingVisualMediaStateTrackBindingsRef: refs.syncOutgoingVisualMediaStateTrackBindingsRef,
    clearOutgoingMediaStateTrackBindingsRef: refs.clearOutgoingMediaStateTrackBindingsRef,
    remoteVideoTrackRefreshTimerRef: refs.remoteVideoTrackRefreshTimerRef,
    refreshRemoteVideoTracksFromPeerRef: refs.refreshRemoteVideoTracksFromPeerRef,
  };

  const transportState = {
    peerConnectionRef: refs.peerConnectionRef,
    pendingIceCandidatesRef: refs.pendingIceCandidatesRef,
    incomingIceCandidatesRef: refs.incomingIceCandidatesRef,
    outgoingIceBatchRef: refs.outgoingIceBatchRef,
    disconnectResetTimerRef: refs.disconnectResetTimerRef,
    disconnectRecoveryAttemptedRef: refs.disconnectRecoveryAttemptedRef,
  };

  const negotiationState = {
    outboundMediaEncryptionOfferRef: refs.outboundMediaEncryptionOfferRef,
    directCallNegotiationRoleRef: refs.directCallNegotiationRoleRef,
    supportsPeerRenegotiationV1Ref: refs.supportsPeerRenegotiationV1Ref,
    sendRenegotiationOfferRef: refs.sendRenegotiationOfferRef,
    flushPendingRenegotiationOfferRef: refs.flushPendingRenegotiationOfferRef,
    negotiationReadyRef: refs.negotiationReadyRef,
    makingOfferRef: refs.makingOfferRef,
    ignoreOfferRef: refs.ignoreOfferRef,
    isSettingRemoteAnswerPendingRef: refs.isSettingRemoteAnswerPendingRef,
    renegotiationRevisionRef: refs.renegotiationRevisionRef,
    lastAppliedRemoteRenegotiationRevisionRef: refs.lastAppliedRemoteRenegotiationRevisionRef,
    pendingLocalRenegotiationRevisionRef: refs.pendingLocalRenegotiationRevisionRef,
    pendingRenegotiationReasonRef: refs.pendingRenegotiationReasonRef,
    renegotiationUnsupportedRef: refs.renegotiationUnsupportedRef,
  };

  const diagnosticsState = {
    lastRenegotiationAttemptRef: refs.lastRenegotiationAttemptRef,
    lastSignalingErrorRef: refs.lastSignalingErrorRef,
    callMediaDebugEnabledRef: refs.callMediaDebugEnabledRef,
    debugCallMedia,
    recordLastRenegotiationAttempt,
    shouldIgnoreUnexpectedPeerSignal,
  };

  return {
    sessionState,
    presentationState,
    mediaState,
    transportState,
    negotiationState,
    diagnosticsState,
  };
}

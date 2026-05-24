/**
 * useDirectCallSessionLifecycle — call teardown and lifecycle composition.
 *
 * Owns:
 *   - resetCallState / resetCallStateIfCurrent  (idempotent, guarded by lifecycle token)
 *   - finishCallSession                       (terminal-outcome helper above resetCallState)
 *   - sendAuthoritativeDirectCallHangup / sendAuthoritativeDirectCallReject
 *   - stopLocalMedia, closePeerConnection
 *   - Unmount cleanup (stops ringtone, closes PC, releases frame-crypto, drains ICE batch)
 *
 * Also composes useDirectCallIncomingRingtone and useDirectCallFrameModeRecovery.
 * The lifecycle token incremented here is the cross-session async-safety primitive
 * used by every async callback in the controller to abort stale continuations.
 */
import { useCallback, useEffect } from "react";
import { api } from "@/lib/api";
import { beginDirectCallLifecycleToken } from "@/calls/direct/model/direct-call-lifecycle";
import type { CallNotice } from "@/calls/direct/model/direct-call-types";
import { logger } from "@/lib/logger.js";
import {
  type UseDirectCallSessionLifecycleOptions,
  type DirectCallLifecycleVideoElementRefs,
  type DirectCallLifecycleMediaStateRefs,
} from "./session/direct-call-session-lifecycle-shared";
import { closePeerConnection as doClosePeerConnection } from "./direct-call-pc-utils";
import { clearDirectCallNegotiationState } from "./setup/direct-call-setup-shared";
import { type DirectCallFinishSession } from "./direct-call-runtime-types";
import { useDirectCallFrameModeRecovery } from "./session/useDirectCallFrameModeRecovery";
import { useDirectCallIncomingRingtone } from "./session/useDirectCallIncomingRingtone";
import { useDirectCallOutgoingRingtone } from "./session/useDirectCallOutgoingRingtone";

function detachVideoElements(refs: DirectCallLifecycleVideoElementRefs): void {
  if (refs.localVideoRef.current) refs.localVideoRef.current.srcObject = null;
  if (refs.localScreenPreviewRef.current) refs.localScreenPreviewRef.current.srcObject = null;
  if (refs.remoteVideoRef.current) refs.remoteVideoRef.current.srcObject = null;
  if (refs.remoteScreenVideoRef.current) refs.remoteScreenVideoRef.current.srcObject = null;
  if (refs.remoteCameraProbeRef.current) refs.remoteCameraProbeRef.current.srcObject = null;
  if (refs.remoteScreenProbeRef.current) refs.remoteScreenProbeRef.current.srcObject = null;
  if (refs.remoteAudioRef.current) refs.remoteAudioRef.current.srcObject = null;
}

function resetMediaStateRefs(refs: DirectCallLifecycleMediaStateRefs): void {
  refs.remoteCameraPlaybackRef.current = { lastTime: 0, lastFrameCount: 0, lastProgressAt: 0 };
  refs.remoteScreenPlaybackRef.current = { lastTime: 0, lastFrameCount: 0, lastProgressAt: 0 };
  refs.remoteInboundVideoProgressRef.current.clear();
  refs.callMediaStateSeqRef.current = 0;
  refs.localMediaStateRevisionRef.current = { camera: 0, screen: 0, mic: 0 };
  refs.remoteMediaStateSeqRef.current = { camera: 0, screen: 0, mic: 0 };
  refs.remoteMediaStateRevisionRef.current = { camera: 0, screen: 0, mic: 0 };
  refs.lastIncomingMediaStateRef.current = { camera: null, screen: null, mic: null };
}

export function useDirectCallSessionLifecycle(options: UseDirectCallSessionLifecycleOptions) {
  const {
    active,
    incomingCallId,
    callSecurityMode,
    remoteVideoReady,
    remoteScreenReady,
    remoteCameraSlot,
    remoteScreenSlot,
    remoteCameraStreamRef,
    remoteScreenStreamRef,
    activeRef,
    incomingRef,
    acceptingIncomingCallRef,
    localVideoRef,
    localScreenPreviewRef,
    remoteVideoRef,
    remoteScreenVideoRef,
    remoteCameraProbeRef,
    remoteScreenProbeRef,
    remoteAudioRef,
    remoteCameraPlaybackRef,
    remoteScreenPlaybackRef,
    remoteInboundVideoProgressRef,
    callMediaStateSeqRef,
    localMediaStateRevisionRef,
    remoteMediaStateSeqRef,
    remoteMediaStateRevisionRef,
    lastIncomingMediaStateRef,
    setIncoming,
    setActive,
    setIsMinimized,
    peerConnectionRef,
    localStreamRef,
    cameraSenderRef,
    cameraTransceiverRef,
    screenShareTrackRef,
    screenShareSenderRef,
    screenShareTransceiverRef,
    localScreenPreviewStreamRef,
    remoteAudioStreamRef,
    outgoingIceBatchReset,
    resetRemoteMediaRuntime,
    closeDirectCallFrameCrypto,
    resetMinimizedDockState,
    resetLocalPreviewState,
    resetLocalScreenPreviewState,
    pushNotice,
    outboundMediaEncryptionOfferRef,
    pendingIceCandidatesRef,
    incomingIceCandidatesRef,
    frameModeRecoveryTimerRef,
    frameModeRecoveryAttemptedCallIdRef,
    directCallLifecycleTokenRef,
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
    pendingRenegotiationReasonRef,
    lastRenegotiationAttemptRef,
    lastSignalingErrorRef,
    disconnectResetTimerRef,
    disconnectRecoveryAttemptedRef,
    clearOutgoingMediaStateTrackBindingsRef,
    isCurrentActiveCallContext,
    configureDirectCallFrameCrypto,
    incomingRingtoneRef,
    outgoingRingtoneRef,
    t,
  } = options;

  const { stopIncomingRingtone } = useDirectCallIncomingRingtone({
    incomingCallId,
    incomingRingtoneRef,
  });
  const { stopOutgoingRingtone } = useDirectCallOutgoingRingtone({
    active,
    outgoingRingtoneRef,
  });

  const stopLocalMedia = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    const screenTrack = screenShareTrackRef.current;
    if (screenTrack) {
      screenTrack.stop();
    }
    cameraSenderRef.current = null;
    cameraTransceiverRef.current = null;
    screenShareSenderRef.current = null;
    screenShareTransceiverRef.current = null;
    screenShareTrackRef.current = null;
    localScreenPreviewStreamRef.current = null;
    remoteAudioStreamRef.current = null;
    detachVideoElements({
      localVideoRef,
      localScreenPreviewRef,
      remoteVideoRef,
      remoteScreenVideoRef,
      remoteCameraProbeRef,
      remoteScreenProbeRef,
      remoteAudioRef,
    });
    resetMediaStateRefs({
      remoteCameraPlaybackRef,
      remoteScreenPlaybackRef,
      remoteInboundVideoProgressRef,
      callMediaStateSeqRef,
      localMediaStateRevisionRef,
      remoteMediaStateSeqRef,
      remoteMediaStateRevisionRef,
      lastIncomingMediaStateRef,
    });
    resetLocalPreviewState();
    resetLocalScreenPreviewState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetLocalPreviewState, resetLocalScreenPreviewState]);

  const closePeerConnection = useCallback(
    () => doClosePeerConnection(peerConnectionRef),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const sendAuthoritativeDirectCallHangup = useCallback(async (callId: string) => {
    try {
      await api.directHangupCall(callId);
    } catch (error) {
      logger.warn("[CALL] failed to commit direct-call hangup", error);
    }
  }, []);

  const sendAuthoritativeDirectCallReject = useCallback(async (callId: string) => {
    try {
      await api.directRejectCall(callId);
    } catch (error) {
      logger.warn("[CALL] failed to commit direct-call reject", error);
    }
  }, []);

  const resetCallState = useCallback((opts?: { sendHangup?: boolean; notice?: CallNotice }) => {
    if (opts?.sendHangup && activeRef.current) {
      void sendAuthoritativeDirectCallHangup(activeRef.current.callId);
    }
    directCallLifecycleTokenRef.current = beginDirectCallLifecycleToken(
      directCallLifecycleTokenRef.current
    );
    stopIncomingRingtone();
    stopOutgoingRingtone();
    closePeerConnection();
    clearOutgoingMediaStateTrackBindingsRef.current();
    stopLocalMedia();
    closeDirectCallFrameCrypto();
    if (disconnectResetTimerRef.current) {
      clearTimeout(disconnectResetTimerRef.current);
      disconnectResetTimerRef.current = null;
    }
    resetRemoteMediaRuntime();
    if (frameModeRecoveryTimerRef.current) {
      clearTimeout(frameModeRecoveryTimerRef.current);
      frameModeRecoveryTimerRef.current = null;
    }
    frameModeRecoveryAttemptedCallIdRef.current = null;
    incomingRef.current = null;
    acceptingIncomingCallRef.current = null;
    activeRef.current = null;
    setIncoming(null);
    setActive(null);
    setIsMinimized(false);
    resetMinimizedDockState();
    outgoingIceBatchReset();
    pendingIceCandidatesRef.current.clear();
    incomingIceCandidatesRef.current.clear();
    outboundMediaEncryptionOfferRef.current = null;
    clearDirectCallNegotiationState({
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
      pendingRenegotiationReasonRef,
      lastRenegotiationAttemptRef,
      lastSignalingErrorRef,
      disconnectRecoveryAttemptedRef,
    });
    if (opts?.notice) pushNotice(opts.notice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    closeDirectCallFrameCrypto,
    closePeerConnection,
    outgoingIceBatchReset,
    pushNotice,
    resetMinimizedDockState,
    resetRemoteMediaRuntime,
    sendAuthoritativeDirectCallHangup,
    setActive,
    setIncoming,
    setIsMinimized,
    stopIncomingRingtone,
    stopOutgoingRingtone,
    stopLocalMedia,
  ]);

  const resetCallStateIfCurrent = useCallback((
    callId: string,
    opts?: { sendHangup?: boolean; notice?: CallNotice },
    pc?: RTCPeerConnection | null
  ): boolean => {
    if (!isCurrentActiveCallContext(callId, pc)) {
      return false;
    }
    resetCallState(opts);
    return true;
  }, [isCurrentActiveCallContext, resetCallState]);

  const finishCallSession = useCallback<DirectCallFinishSession>((opts) => {
    const callId = opts.callId
      ?? activeRef.current?.callId
      ?? acceptingIncomingCallRef.current?.callId
      ?? incomingRef.current?.callId
      ?? null;

    opts.onBeforeReset?.();

    // Terminal teardown must not wait on the backend commit. We capture the
    // session id first, dispatch the best-effort authoritative signal, and
    // then converge immediately on the local reset path.
    if (opts.authority === "hangup" && callId) {
      void sendAuthoritativeDirectCallHangup(callId);
    }
    if (opts.authority === "reject" && callId) {
      void sendAuthoritativeDirectCallReject(callId);
    }

    resetCallState({ notice: opts.notice });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetCallState, sendAuthoritativeDirectCallHangup, sendAuthoritativeDirectCallReject]);

  useDirectCallFrameModeRecovery({
    active,
    activeRef,
    callSecurityMode,
    remoteVideoReady,
    remoteScreenReady,
    remoteCameraSlot,
    remoteScreenSlot,
    remoteCameraStreamRef,
    remoteScreenStreamRef,
    remoteAudioRef,
    remoteAudioStreamRef,
    lastIncomingMediaStateRef,
    setActive,
    configureDirectCallFrameCrypto,
    pushNotice,
    t,
    frameModeRecoveryTimerRef,
    frameModeRecoveryAttemptedCallIdRef,
  });

  useEffect(() => {
    return () => {
      resetRemoteMediaRuntime();
      stopIncomingRingtone();
      stopOutgoingRingtone();
      outgoingIceBatchReset();
      closePeerConnection();
      stopLocalMedia();
      closeDirectCallFrameCrypto();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    finishCallSession,
    resetCallState,
    resetCallStateIfCurrent,
    sendAuthoritativeDirectCallHangup,
    sendAuthoritativeDirectCallReject,
  };
}

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
import { type UseDirectCallSessionLifecycleOptions } from "./direct-call-session-lifecycle-shared";
import { closePeerConnection as doClosePeerConnection } from "./direct-call-pc-utils";
import { clearDirectCallNegotiationState } from "./direct-call-setup-shared";
import { type DirectCallFinishSession } from "./direct-call-runtime-types";
import { useDirectCallIncomingRingtone } from "./useDirectCallIncomingRingtone";
import { useDirectCallFrameModeRecovery } from "./useDirectCallFrameModeRecovery";

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
    t,
  } = options;

  const { stopIncomingRingtone } = useDirectCallIncomingRingtone({
    incomingCallId,
    incomingRingtoneRef,
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
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (localScreenPreviewRef.current) localScreenPreviewRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteScreenVideoRef.current) remoteScreenVideoRef.current.srcObject = null;
    if (remoteCameraProbeRef.current) remoteCameraProbeRef.current.srcObject = null;
    if (remoteScreenProbeRef.current) remoteScreenProbeRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    remoteCameraPlaybackRef.current = { lastTime: 0, lastFrameCount: 0, lastProgressAt: 0 };
    remoteScreenPlaybackRef.current = { lastTime: 0, lastFrameCount: 0, lastProgressAt: 0 };
    remoteInboundVideoProgressRef.current.clear();
    callMediaStateSeqRef.current = 0;
    localMediaStateRevisionRef.current = { camera: 0, screen: 0, mic: 0 };
    remoteMediaStateSeqRef.current = { camera: 0, screen: 0, mic: 0 };
    remoteMediaStateRevisionRef.current = { camera: 0, screen: 0, mic: 0 };
    lastIncomingMediaStateRef.current = { camera: null, screen: null, mic: null };
    resetLocalPreviewState();
    resetLocalScreenPreviewState();
  }, [
    callMediaStateSeqRef,
    cameraSenderRef,
    cameraTransceiverRef,
    lastIncomingMediaStateRef,
    localMediaStateRevisionRef,
    localScreenPreviewRef,
    localScreenPreviewStreamRef,
    localStreamRef,
    localVideoRef,
    remoteAudioRef,
    remoteAudioStreamRef,
    remoteCameraPlaybackRef,
    remoteCameraProbeRef,
    remoteInboundVideoProgressRef,
    remoteMediaStateRevisionRef,
    remoteMediaStateSeqRef,
    remoteScreenPlaybackRef,
    remoteScreenProbeRef,
    remoteScreenVideoRef,
    remoteVideoRef,
    resetLocalPreviewState,
    resetLocalScreenPreviewState,
    screenShareSenderRef,
    screenShareTrackRef,
    screenShareTransceiverRef,
  ]);

  const closePeerConnection = useCallback(
    () => doClosePeerConnection(peerConnectionRef),
    [peerConnectionRef]
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
    closePeerConnection();
    clearOutgoingMediaStateTrackBindingsRef.current();
    stopLocalMedia();
    closeDirectCallFrameCrypto();
    if (disconnectResetTimerRef.current) {
      clearTimeout(disconnectResetTimerRef.current);
      disconnectResetTimerRef.current = null;
    }
    remoteInboundVideoProgressRef.current.clear();
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
  }, [
    activeRef,
    acceptingIncomingCallRef,
    clearOutgoingMediaStateTrackBindingsRef,
    closeDirectCallFrameCrypto,
    closePeerConnection,
    directCallLifecycleTokenRef,
    directCallNegotiationRoleRef,
    disconnectRecoveryAttemptedRef,
    disconnectResetTimerRef,
    frameModeRecoveryAttemptedCallIdRef,
    frameModeRecoveryTimerRef,
    ignoreOfferRef,
    incomingIceCandidatesRef,
    incomingRef,
    isSettingRemoteAnswerPendingRef,
    lastAppliedRemoteRenegotiationRevisionRef,
    lastRenegotiationAttemptRef,
    lastSignalingErrorRef,
    makingOfferRef,
    negotiationReadyRef,
    outgoingIceBatchReset,
    outboundMediaEncryptionOfferRef,
    pendingIceCandidatesRef,
    pendingLocalRenegotiationRevisionRef,
    pendingRenegotiationReasonRef,
    pushNotice,
    remoteInboundVideoProgressRef,
    renegotiationRevisionRef,
    renegotiationUnsupportedRef,
    resetMinimizedDockState,
    resetRemoteMediaRuntime,
    sendAuthoritativeDirectCallHangup,
    setActive,
    setIncoming,
    setIsMinimized,
    stopIncomingRingtone,
    stopLocalMedia,
    supportsPeerRenegotiationV1Ref,
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
  }, [
    acceptingIncomingCallRef,
    activeRef,
    incomingRef,
    resetCallState,
    sendAuthoritativeDirectCallHangup,
    sendAuthoritativeDirectCallReject,
  ]);

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
    setActive,
    configureDirectCallFrameCrypto,
    pushNotice,
    t,
    frameModeRecoveryTimerRef,
    frameModeRecoveryAttemptedCallIdRef,
  });

  const runUnmountCleanup = useCallback(() => {
    resetRemoteMediaRuntime();
    stopIncomingRingtone();
    outgoingIceBatchReset();
    closePeerConnection();
    stopLocalMedia();
    closeDirectCallFrameCrypto();
  }, [
    closeDirectCallFrameCrypto,
    closePeerConnection,
    outgoingIceBatchReset,
    resetRemoteMediaRuntime,
    stopIncomingRingtone,
    stopLocalMedia,
  ]);

  useEffect(() => {
    return () => {
      runUnmountCleanup();
    };
  }, [runUnmountCleanup]);

  return {
    finishCallSession,
    resetCallState,
    resetCallStateIfCurrent,
    sendAuthoritativeDirectCallHangup,
    sendAuthoritativeDirectCallReject,
  };
}

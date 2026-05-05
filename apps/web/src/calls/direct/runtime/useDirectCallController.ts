/**
 * useDirectCallController — composition root for the 1:1 call runtime.
 *
 * This hook does not contain business logic. Its sole responsibility is wiring:
 * it instantiates every runtime sub-hook, threads refs and callbacks between
 * them, and returns the minimal surface consumed by DirectCallPanel.
 *
 * Ownership map:
 *   State & refs      → useDirectCallControllerState
 *   Teardown          → useDirectCallSessionLifecycle (finishCallSession, resetCallState, closePeerConnection)
 *   WebRTC core       → useDirectCallPeerConnectionRuntime
 *   Signaling ingress → useDirectCallSignalRuntime
 *   Negotiation       → useDirectCallNegotiationRuntime
 *   Call setup/accept → useDirectCallSetupControlRuntime
 *   Media controls    → useDirectCallOutgoingMediaState + useDirectCallVisualMediaControls
 *   Presentation      → useDirectCallPresentationBindings
 */
import {
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { useMessagesStore } from "@/stores/messages";
import { useSecuritySettings } from "@/ui-settings";
import { useDirectCallPageLifecycle } from "./useDirectCallPageLifecycle";
import { useDirectCallDevDebug } from "./useDirectCallDevDebug";
import { useDirectCallLocalMedia } from "./useDirectCallLocalMedia";
import { useDirectCallIceBatch } from "./useDirectCallIceBatch";
import { useDirectCallSecurityState } from "./useDirectCallSecurityState";
import { useDirectCallUiFeedback } from "./useDirectCallUiFeedback";
import { useDirectCallFrameCryptoRuntime } from "./useDirectCallFrameCryptoRuntime";
import { useDirectCallSignalRuntime } from "./useDirectCallSignalRuntime";
import { useDirectCallNegotiationRuntime } from "./useDirectCallNegotiationRuntime";
import { useDirectCallPeerConnectionRuntime } from "./useDirectCallPeerConnectionRuntime";
import { useDirectCallRemoteMediaRuntime } from "./useDirectCallRemoteMediaRuntime";
import { useDirectCallSetupControlRuntime } from "./useDirectCallSetupControlRuntime";
import { useDirectCallOutgoingMediaState } from "./useDirectCallOutgoingMediaState";
import { useDirectCallVisualMediaControls } from "./useDirectCallVisualMediaControls";
import { useDirectCallControllerState } from "./useDirectCallControllerState";
import { useDirectCallPresentationBindings } from "./useDirectCallPresentationBindings";
import { useDirectCallSessionLifecycle } from "./useDirectCallSessionLifecycle";
import { useDirectCallRemoteTelemetry } from "./useDirectCallRemoteTelemetry";
import { useDirectCallMediaElementBindings } from "./useDirectCallMediaElementBindings";
import { useDirectCallRemoteReceiverIngress } from "./useDirectCallRemoteReceiverIngress";
import { useDirectCallVisualStateSummary } from "./useDirectCallVisualStateSummary";

export function useDirectCallController() {
  const { t } = useI18n();
  const { callSecurityMode } = useSecuritySettings();
  const ensureConversationUsername = useMessagesStore((state) => state.ensureConversationUsername);
  const {
    sessionState,
    presentationState,
    mediaState,
    transportState,
    negotiationState,
    diagnosticsState,
  } = useDirectCallControllerState();

  const {
    incoming,
    active,
    incomingRef,
    acceptingIncomingCallRef,
    activeRef,
    commitIncomingState,
    commitActiveState,
    isCurrentActiveCallContext,
    setActiveIfCurrent,
    directCallLifecycleTokenRef,
  } = sessionState;

  const {
    notice,
    isMinimized,
    isSecurityCardOpen,
    setNotice,
    setIsMinimized,
    setIsSecurityCardOpen,
    localPreviewShellRef,
    localScreenPreviewShellRef,
    minimizedDockRef,
    incomingOverlayRef,
    activeOverlayRef,
    incomingAcceptButtonRef,
    incomingMinimizedAcceptButtonRef,
    incomingMinimizedSummaryRef,
    activeMinimizedSummaryRef,
    activeHangupButtonRef,
    noticeTimerRef,
    incomingRingtoneRef,
    isDraggingMinimizedDock,
    isDraggingLocalPreview,
    isDraggingLocalScreenPreview,
    minimizedDockInlineStyle,
    localPreviewStyle,
    localScreenPreviewStyle,
    startMinimizedDockDrag,
    moveMinimizedDock,
    stopMinimizedDockDrag,
    startLocalPreviewDrag,
    moveLocalPreview,
    stopLocalPreviewDrag,
    isResizingLocalPreview,
    startLocalPreviewResize,
    moveLocalPreviewResize,
    stopLocalPreviewResize,
    startLocalScreenPreviewDrag,
    moveLocalScreenPreview,
    stopLocalScreenPreviewDrag,
    resetMinimizedDockState,
    resetLocalPreviewState,
    resetLocalScreenPreviewState,
  } = presentationState;

  const {
    localVideoRef,
    localScreenPreviewRef,
    remoteCameraPlaybackRef,
    remoteScreenPlaybackRef,
    remoteInboundVideoProgressRef,
    callMediaStateSeqRef,
    localMediaStateRevisionRef,
    remoteMediaStateSeqRef,
    remoteMediaStateRevisionRef,
    lastIncomingMediaStateRef,
    localStreamRef,
    cameraSenderRef,
    cameraTransceiverRef,
    screenShareTrackRef,
    screenShareSenderRef,
    screenShareTransceiverRef,
    localScreenPreviewStreamRef,
    directCallFrameCryptoStateRef,
    directCallSenderFrameHandlesRef,
    directCallReceiverFrameHandlesRef,
    frameModeRecoveryTimerRef,
    frameModeRecoveryAttemptedCallIdRef,
    syncOutgoingVisualMediaStateTrackBindingsRef,
    clearOutgoingMediaStateTrackBindingsRef,
    remoteVideoTrackRefreshTimerRef,
    refreshRemoteVideoTracksFromPeerRef,
  } = mediaState;

  const {
    peerConnectionRef,
    pendingIceCandidatesRef,
    incomingIceCandidatesRef,
    outgoingIceBatchRef,
    disconnectResetTimerRef,
    disconnectRecoveryAttemptedRef,
  } = transportState;

  const {
    outboundMediaEncryptionOfferRef,
    directCallNegotiationRoleRef,
    supportsPeerRenegotiationV1Ref,
    sendRenegotiationOfferRef,
    flushPendingRenegotiationOfferRef,
    negotiationReadyRef,
    makingOfferRef,
    ignoreOfferRef,
    isSettingRemoteAnswerPendingRef,
    renegotiationRevisionRef,
    lastAppliedRemoteRenegotiationRevisionRef,
    pendingLocalRenegotiationRevisionRef,
    pendingRenegotiationReasonRef,
    renegotiationUnsupportedRef,
  } = negotiationState;

  const {
    lastRenegotiationAttemptRef,
    lastSignalingErrorRef,
    callMediaDebugEnabledRef,
    debugCallMedia,
    recordLastRenegotiationAttempt,
    shouldIgnoreUnexpectedPeerSignal,
  } = diagnosticsState;

  const activeCallId = active?.callId ?? null;
  const {
    remoteCameraSlot,
    remoteScreenSlot,
    remoteVideoReady,
    remoteScreenReady,
    remoteCameraUiStatus,
    remoteScreenUiStatus,
    remoteVideoRef,
    remoteScreenVideoRef,
    remoteVideoCompanionRef,
    remoteScreenCompanionRef,
    remoteCameraProbeRef,
    remoteScreenProbeRef,
    remoteAudioRef,
    remoteAudioStreamRef,
    remoteCameraStreamRef,
    remoteScreenStreamRef,
    remoteCameraSlotRef,
    remoteScreenSlotRef,
    remoteReceiverSlotBindingsRef,
    resolveRemoteReceiverSlotSource,
    processIncomingMediaStateHint,
    updateSlotProgress,
    ingestRemoteVideoTrack,
    resetRemoteMediaRuntime,
  } = useDirectCallRemoteMediaRuntime({
    activeCallId,
    peerConnectionRef,
    cameraTransceiverRef,
    screenShareTransceiverRef,
    lastIncomingMediaStateRef,
    debugCallMedia,
  });

  useDirectCallPageLifecycle({
    activeRef,
    debugCallMedia,
  });

  useEffect(() => {
    supportsPeerRenegotiationV1Ref.current = active?.peerSupportsRenegotiationV1 ?? false;
  }, [active?.peerSupportsRenegotiationV1, supportsPeerRenegotiationV1Ref]);

  useEffect(() => {
    setIsSecurityCardOpen(false);
  }, [active?.callId, setIsSecurityCardOpen]);

  const {
    resolvePeerLabel,
    recordCallEvent,
    pushNotice,
  } = useDirectCallUiFeedback({
    setNotice,
    noticeTimerRef,
  });

  useDirectCallDevDebug({
    activeRef,
    incomingRef,
    peerConnectionRef,
    localStreamRef,
    remoteAudioStreamRef,
    remoteCameraStreamRef,
    remoteScreenStreamRef,
    remoteCameraSlotRef,
    remoteScreenSlotRef,
    remoteReceiverSlotBindingsRef,
    cameraSenderRef,
    screenShareSenderRef,
    cameraTransceiverRef,
    screenShareTransceiverRef,
    callMediaStateSeqRef,
    localMediaStateRevisionRef,
    remoteMediaStateSeqRef,
    remoteMediaStateRevisionRef,
    lastIncomingMediaStateRef,
    directCallNegotiationRoleRef,
    makingOfferRef,
    ignoreOfferRef,
    isSettingRemoteAnswerPendingRef,
    renegotiationRevisionRef,
    pendingLocalRenegotiationRevisionRef,
    pendingRenegotiationReasonRef,
    lastRenegotiationAttemptRef,
    supportsPeerRenegotiationV1Ref,
    renegotiationUnsupportedRef,
    lastSignalingErrorRef,
    negotiationReadyRef,
    remoteVideoReady,
    remoteScreenReady,
    remoteCameraUiStatus,
    remoteScreenUiStatus,
    remoteVideoRef,
    remoteScreenVideoRef,
    remoteCameraProbeRef,
    remoteScreenProbeRef,
    localVideoRef,
    callMediaDebugEnabledRef,
  });
  const {
    flushOutgoingIceBatch,
    resetOutgoingIceBatch,
    enqueueOutgoingIceCandidate,
  } = useDirectCallIceBatch(outgoingIceBatchRef);

  const {
    closeDirectCallFrameCrypto,
    resolveLocalSupportedMediaEncryptionModes,
    ensureDirectCallSenderFrameCryptoBound,
    primeDirectCallSenderFrameCrypto,
    ensureDirectCallReceiverFrameCryptoBound,
    configureDirectCallFrameCrypto,
    prepareLocalEphemeralKey,
    setPeerEphemeralPublicKey,
  } = useDirectCallFrameCryptoRuntime({
    peerConnectionRef,
    cameraSenderRef,
    screenShareSenderRef,
    directCallFrameCryptoStateRef,
    directCallSenderFrameHandlesRef,
    directCallReceiverFrameHandlesRef,
    debugCallMedia,
  });
  const {
    finishCallSession,
    resetCallState,
    resetCallStateIfCurrent,
    sendAuthoritativeDirectCallReject,
  } = useDirectCallSessionLifecycle({
    active,
    incomingCallId: incoming?.callId ?? null,
    callSecurityMode,
    remoteVideoReady,
    remoteScreenReady,
    remoteCameraSlot,
    remoteScreenSlot,
    remoteCameraStreamRef,
    remoteScreenStreamRef,
    incomingRef,
    acceptingIncomingCallRef,
    activeRef,
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
    setIncoming: commitIncomingState,
    setActive: commitActiveState,
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
    outgoingIceBatchReset: resetOutgoingIceBatch,
    resetRemoteMediaRuntime,
    closeDirectCallFrameCrypto,
    resetMinimizedDockState,
    resetLocalPreviewState,
    resetLocalScreenPreviewState,
    configureDirectCallFrameCrypto,
    pushNotice,
    t,
    outboundMediaEncryptionOfferRef,
    pendingIceCandidatesRef,
    incomingIceCandidatesRef,
    frameModeRecoveryTimerRef,
    frameModeRecoveryAttemptedCallIdRef,
    incomingRingtoneRef,
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
  });

  const getTurnCredentials = useCallback(async () => {
    return api.get<{
      username: string;
      password: string;
      uris: string[];
    }>("/calls/turn-credentials");
  }, []);
  const {
    applySignalVerificationResult,
    applyCallSecurityState,
  } = useDirectCallSecurityState({
    activeRef,
    setActive: commitActiveState,
    t,
  });
  const {
    ingestRemoteReceiverTrack,
    refreshRemoteVideoTracksFromPeer,
  } = useDirectCallRemoteReceiverIngress({
    activeRef,
    peerConnectionRef,
    remoteAudioRef,
    remoteAudioStreamRef,
    remoteVideoTrackRefreshTimerRef,
    refreshRemoteVideoTracksFromPeerRef,
    debugCallMedia,
    isCurrentActiveCallContext,
    ensureDirectCallReceiverFrameCryptoBound,
    ingestRemoteVideoTrack,
    resolveRemoteReceiverSlotSource,
  });

  const { createPeerConnection } = useDirectCallPeerConnectionRuntime({
    activeRef,
    peerConnectionRef,
    disconnectResetTimerRef,
    disconnectRecoveryAttemptedRef,
    negotiationReadyRef,
    renegotiationUnsupportedRef,
    sendRenegotiationOfferRef,
    flushPendingRenegotiationOfferRef,
    getTurnCredentials,
    enqueueOutgoingIceCandidate,
    flushOutgoingIceBatch,
    ingestRemoteReceiverTrack,
    isCurrentActiveCallContext,
    setActiveIfCurrent,
    resetCallStateIfCurrent,
    debugCallMedia,
    t,
  });

  const {
    ensureVideoSenders,
    syncVisualTransceiverBindings,
    attachLocalTracksToPeer,
    syncVisualTransceiverDirections,
    requestLocalStream,
    syncLocalPreview,
    syncLocalScreenPreview,
  } = useDirectCallLocalMedia({
    peerConnectionRef,
    cameraTransceiverRef,
    screenShareTransceiverRef,
    cameraSenderRef,
    screenShareSenderRef,
    localStreamRef,
    screenShareTrackRef,
    localVideoRef,
    localScreenPreviewRef,
    localScreenPreviewStreamRef,
    remoteReceiverSlotBindingsRef,
    debugCallMedia,
  });

  // Stable ref-forwarding callbacks. These are intentionally created with empty deps —
  // the refs themselves are stable objects whose .current is updated via useEffect below.
  const stableSyncOutgoing = useCallback((callIdOverride?: string) => {
    syncOutgoingVisualMediaStateTrackBindingsRef.current(callIdOverride);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stableRefreshRemote = useCallback((callIdOverride?: string, reason?: string) => {
    refreshRemoteVideoTracksFromPeerRef.current(callIdOverride, reason);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearNotice = useCallback(() => setNotice(null), [setNotice]);

  const {
    sendRenegotiationOffer,
    flushPendingRenegotiationOffer,
    handleIncomingRenegotiationAnswer,
    handleIncomingRenegotiationOffer,
    handleRemoteAnswer,
  } = useDirectCallNegotiationRuntime({
    activeRef,
    peerConnectionRef,
    supportsPeerRenegotiationV1Ref,
    renegotiationUnsupportedRef,
    pendingRenegotiationReasonRef,
    makingOfferRef,
    ignoreOfferRef,
    isSettingRemoteAnswerPendingRef,
    renegotiationRevisionRef,
    lastAppliedRemoteRenegotiationRevisionRef,
    pendingLocalRenegotiationRevisionRef,
    directCallNegotiationRoleRef,
    negotiationReadyRef,
    lastRenegotiationAttemptRef,
    lastSignalingErrorRef,
    outboundMediaEncryptionOfferRef,
    pendingIceCandidatesRef,
    setActive: commitActiveState,
    callSecurityMode,
    debugCallMedia,
    recordLastRenegotiationAttempt,
    shouldIgnoreUnexpectedPeerSignal,
    isCurrentActiveCallContext,
    resetCallState,
    resetCallStateIfCurrent,
    syncVisualTransceiverBindings,
    syncVisualTransceiverDirections,
    syncOutgoingVisualMediaStateTrackBindings: stableSyncOutgoing,
    refreshRemoteVideoTracksFromPeer: stableRefreshRemote,
    configureDirectCallFrameCrypto,
    setPeerEphemeralPublicKey,
    applySignalVerificationResult,
    applyCallSecurityState,
    setActiveIfCurrent,
    pushNotice,
    t,
  });

  useEffect(() => {
    sendRenegotiationOfferRef.current = sendRenegotiationOffer;
  }, [sendRenegotiationOffer, sendRenegotiationOfferRef]);

  useEffect(() => {
    flushPendingRenegotiationOfferRef.current = flushPendingRenegotiationOffer;
  }, [flushPendingRenegotiationOffer, flushPendingRenegotiationOfferRef]);

  const localSupportedMediaEncryptionModes = useMemo(
    () => resolveLocalSupportedMediaEncryptionModes(),
    [resolveLocalSupportedMediaEncryptionModes],
  );

  const {
    hasRenderableRemoteCamera,
    hasRenderableRemoteScreen,
    hasRemoteVisualMedia,
    isVideoCallActive,
    shouldRenderLocalCameraPreview,
    localSupportsFrameEncryption,
  } = useDirectCallVisualStateSummary({
    active,
    localStream: localStreamRef.current,
    remoteCameraSlot,
    remoteScreenSlot,
    localSupportedMediaEncryptionModes,
  });

  useDirectCallRemoteTelemetry({
    activeCallId,
    activeRef,
    peerConnectionRef,
    localStreamRef,
    cameraSenderRef,
    screenShareSenderRef,
    remoteInboundVideoProgressRef,
    remoteCameraSlotRef,
    remoteScreenSlotRef,
    remoteCameraProbeRef,
    remoteScreenProbeRef,
    remoteCameraPlaybackRef,
    remoteScreenPlaybackRef,
    debugCallMedia,
    updateSlotProgress,
  });

  useDirectCallMediaElementBindings({
    activeCallId,
    isMinimized,
    isVideoCallActive,
    hasRenderableRemoteCamera,
    hasRenderableRemoteScreen,
    remoteVideoReady,
    remoteScreenReady,
    localVideoRef,
    localScreenPreviewRef,
    remoteVideoRef,
    remoteVideoCompanionRef,
    remoteScreenVideoRef,
    remoteScreenCompanionRef,
    remoteCameraProbeRef,
    remoteScreenProbeRef,
    remoteAudioRef,
    localStreamRef,
    localScreenPreviewStreamRef,
    remoteAudioStreamRef,
    remoteCameraStreamRef,
    remoteScreenStreamRef,
    remoteCameraSlotStream: remoteCameraSlot.stream,
    remoteCameraSlotTrackId: remoteCameraSlot.trackId,
    remoteScreenSlotStream: remoteScreenSlot.stream,
    remoteScreenSlotTrackId: remoteScreenSlot.trackId,
    refreshRemoteVideoTracksFromPeer,
  });

  const {
    startCall,
    acceptCall,
    rejectCall,
    hangup,
  } = useDirectCallSetupControlRuntime({
    activeRef,
    incomingRef,
    acceptingIncomingCallRef,
    peerConnectionRef,
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
    pendingIceCandidatesRef,
    incomingIceCandidatesRef,
    outboundMediaEncryptionOfferRef,
    commitIncomingState,
    commitActiveState,
    setIsMinimized,
    resetMinimizedDockState,
    clearNotice,
    callSecurityMode,
    ensureConversationUsername,
    resolvePeerLabel,
    pushNotice,
    recordCallEvent,
    debugCallMedia,
    createPeerConnection,
    ensureVideoSenders,
    requestLocalStream,
    attachLocalTracksToPeer,
    syncVisualTransceiverBindings,
    syncVisualTransceiverDirections,
    syncOutgoingVisualMediaStateTrackBindings: stableSyncOutgoing,
    refreshRemoteVideoTracksFromPeer: stableRefreshRemote,
    resolveLocalSupportedMediaEncryptionModes,
    primeDirectCallSenderFrameCrypto,
    closeDirectCallFrameCrypto,
    configureDirectCallFrameCrypto,
    prepareLocalEphemeralKey,
    setPeerEphemeralPublicKey,
    applyCallSecurityState,
    finishCallSession,
    t,
  });

  const mediaControlsOptions = {
    activeRef,
    localStreamRef,
    peerConnectionRef,
    cameraTransceiverRef,
    cameraSenderRef,
    screenShareTrackRef,
    screenShareSenderRef,
    screenShareTransceiverRef,
    callMediaStateSeqRef,
    localMediaStateRevisionRef,
    negotiationReadyRef,
    renegotiationUnsupportedRef,
    lastSignalingErrorRef,
    callSecurityMode,
    debugCallMedia,
    recordLastRenegotiationAttempt,
    sendRenegotiationOffer,
    setActiveIfCurrent,
    isCurrentActiveCallContext,
    ensureVideoSenders,
    syncVisualTransceiverBindings,
    syncVisualTransceiverDirections,
    syncLocalPreview,
    syncLocalScreenPreview,
    ensureDirectCallSenderFrameCryptoBound,
    configureDirectCallFrameCrypto,
    resetCallState,
    pushNotice,
    t,
  };

  const {
    sendCallMediaState,
    syncOutgoingVisualMediaStateTrackBindings,
    clearOutgoingMediaStateTrackBindings,
    clearOutgoingVisualMediaStateTrackBinding,
  } = useDirectCallOutgoingMediaState(mediaControlsOptions);

  const {
    canSwitchCamera,
    isSwitchingCamera,
    switchCamera,
    toggleVideo,
    toggleScreenShare,
  } = useDirectCallVisualMediaControls({
    active,
    ...mediaControlsOptions,
    sendCallMediaState,
    syncOutgoingVisualMediaStateTrackBindings,
    clearOutgoingVisualMediaStateTrackBinding,
  });

  const toggleMute = useCallback(() => {
    if (!activeRef.current || !localStreamRef.current) return;
    const nextMuted = !activeRef.current.muted;
    const activeCallId = activeRef.current.callId;
    localStreamRef.current.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setActiveIfCurrent(activeCallId, (prev) => ({ ...prev, muted: nextMuted }));
    sendCallMediaState("mic", nextMuted ? "muted" : "on", undefined, "user-toggle");
  }, [activeRef, localStreamRef, sendCallMediaState, setActiveIfCurrent]);

  useEffect(() => {
    syncOutgoingVisualMediaStateTrackBindingsRef.current = syncOutgoingVisualMediaStateTrackBindings;
  }, [syncOutgoingVisualMediaStateTrackBindings, syncOutgoingVisualMediaStateTrackBindingsRef]);

  useEffect(() => {
    clearOutgoingMediaStateTrackBindingsRef.current = clearOutgoingMediaStateTrackBindings;
  }, [clearOutgoingMediaStateTrackBindings, clearOutgoingMediaStateTrackBindingsRef]);


  useDirectCallSignalRuntime({
    activeRef,
    incomingRef,
    acceptingIncomingCallRef,
    peerConnectionRef,
    incomingIceCandidatesRef,
    pendingIceCandidatesRef,
    ignoreOfferRef,
    supportsPeerRenegotiationV1Ref,
    renegotiationUnsupportedRef,
    lastSignalingErrorRef,
    lastRenegotiationAttemptRef,
    remoteMediaStateSeqRef,
    remoteMediaStateRevisionRef,
    lastIncomingMediaStateRef,
    remoteCameraSlotRef,
    remoteScreenSlotRef,
    setActive: commitActiveState,
    setIncoming: commitIncomingState,
    setIsMinimized,
    ensureConversationUsername,
    resetMinimizedDockState,
    resolvePeerLabel,
    pushNotice,
    recordCallEvent,
    rejectIncomingCall: (callId) => {
      sendAuthoritativeDirectCallReject(callId);
    },
    finishCallSession,
    debugCallMedia,
    shouldIgnoreUnexpectedPeerSignal,
    processIncomingMediaStateHint,
    handleRemoteAnswer,
    handleIncomingRenegotiationOffer,
    handleIncomingRenegotiationAnswer,
    t,
  });

  const {
    surface,
    focusTrapProps,
    surfaceRendererProps,
  } = useDirectCallPresentationBindings({
    active,
    incoming,
    notice,
    isMinimized,
    isSecurityCardOpen,
    localSupportsFrameEncryption,
    callSecurityMode,
    resolvePeerLabel,
    t,
    incomingOverlayRef,
    activeOverlayRef,
    minimizedDockRef,
    incomingAcceptButtonRef,
    activeHangupButtonRef,
    incomingMinimizedAcceptButtonRef,
    incomingMinimizedSummaryRef,
    activeMinimizedSummaryRef,
    remoteAudioRef,
    remoteCameraProbeRef,
    remoteScreenProbeRef,
    localPreviewShellRef,
    localScreenPreviewShellRef,
    localVideoRef,
    localScreenPreviewRef,
    isDraggingMinimizedDock,
    minimizedDockInlineStyle,
    isDraggingLocalPreview,
    isResizingLocalPreview,
    isDraggingLocalScreenPreview,
    localPreviewStyle,
    localScreenPreviewStyle,
    shouldRenderLocalCameraPreview,
    hasRemoteVisualMedia,
    hasRenderableRemoteCamera,
    hasRenderableRemoteScreen,
    remoteScreenStream: remoteScreenSlot.stream,
    remoteVideoRef,
    remoteVideoCompanionRef,
    remoteScreenVideoRef,
    remoteScreenCompanionRef,
    onExpandMinimized: () => setIsMinimized(false),
    onReject: rejectCall,
    onIncomingMinimize: () => setIsMinimized(true),
    onAccept: acceptCall,
    onStartMinimizedDockDrag: startMinimizedDockDrag,
    onMoveMinimizedDock: moveMinimizedDock,
    onStopMinimizedDockDrag: stopMinimizedDockDrag,
    onOpenIncomingDetails: () => setIsMinimized(false),
    onOpenActiveDetails: () => setIsMinimized(false),
    onToggleMute: toggleMute,
    onHangup: hangup,
    onActiveMinimize: () => setIsMinimized(true),
    onToggleSecurityCard: () => setIsSecurityCardOpen((current) => !current),
    onStartLocalPreviewDrag: startLocalPreviewDrag,
    onMoveLocalPreview: moveLocalPreview,
    onStopLocalPreviewDrag: stopLocalPreviewDrag,
    onStartLocalPreviewResize: startLocalPreviewResize,
    onMoveLocalPreviewResize: moveLocalPreviewResize,
    onStopLocalPreviewResize: stopLocalPreviewResize,
    onStartLocalScreenPreviewDrag: startLocalScreenPreviewDrag,
    onMoveLocalScreenPreview: moveLocalScreenPreview,
    onStopLocalScreenPreviewDrag: stopLocalScreenPreviewDrag,
    canSwitchCamera,
    isSwitchingCamera,
    onSwitchCamera: switchCamera,
    onToggleVideo: toggleVideo,
    onToggleScreenShare: toggleScreenShare,
    localStream: localStreamRef.current,
    cameraSenderRef,
  });

  return {
    startCall,
    surface,
    notice,
    focusTrapProps,
    surfaceRendererProps,
  };
}

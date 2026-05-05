import { useCallback } from "react";
import type {
  DirectCallScreenShareStopReason,
  DirectCallVisualMediaControlsOptions,
} from "./direct-call-media-controls-shared";
import { useDirectCallCameraToggle } from "./useDirectCallCameraToggle";
import { useDirectCallCameraSwitch } from "./useDirectCallCameraSwitch";
import { useDirectCallScreenShareControls } from "./useDirectCallScreenShareControls";

export function useDirectCallVisualMediaControls({
  active,
  activeRef,
  localStreamRef,
  peerConnectionRef,
  cameraSenderRef,
  screenShareTrackRef,
  screenShareSenderRef,
  screenShareTransceiverRef,
  negotiationReadyRef,
  renegotiationUnsupportedRef,
  lastSignalingErrorRef,
  callSecurityMode,
  debugCallMedia,
  recordLastRenegotiationAttempt,
  sendRenegotiationOffer,
  configureDirectCallFrameCrypto,
  pushNotice,
  resetCallState,
  setActiveIfCurrent,
  isCurrentActiveCallContext,
  ensureVideoSenders,
  syncVisualTransceiverBindings,
  syncVisualTransceiverDirections,
  syncLocalPreview,
  syncLocalScreenPreview,
  ensureDirectCallSenderFrameCryptoBound,
  t,
  sendCallMediaState,
  syncOutgoingVisualMediaStateTrackBindings,
  clearOutgoingVisualMediaStateTrackBinding,
}: DirectCallVisualMediaControlsOptions) {
  const ensureActiveDirectCallSenderFrameCrypto = useCallback(async (
    callId: string,
    reason: string
  ): Promise<boolean> => {
    const currentActive = activeRef.current;
    if (currentActive?.callId !== callId) {
      return false;
    }
    if (currentActive.mediaEncryptionMode !== "frame-v1") {
      return true;
    }

    const ready = ensureDirectCallSenderFrameCryptoBound(callId);
    debugCallMedia("frame-crypto-sender-sync", {
      callId,
      reason,
      ready,
      mediaEncryptionMode: currentActive.mediaEncryptionMode,
    });
    if (ready) {
      return true;
    }

    if (callSecurityMode === "strict" || !currentActive.peerDeviceId) {
      resetCallState({
        sendHangup: true,
        notice: { kind: "error", message: t("call.error.unableStart") },
      });
      return false;
    }
    const fallbackReady = await configureDirectCallFrameCrypto({
      callId,
      mediaEncryptionMode: "transport",
      peerUserId: currentActive.peerUserId,
      peerDeviceId: currentActive.peerDeviceId,
    });
    debugCallMedia("frame-crypto-sender-sync-fallback", {
      callId,
      reason,
      fallbackReady,
    });
    if (!fallbackReady) {
      resetCallState({
        sendHangup: true,
        notice: { kind: "error", message: t("call.error.unableStart") },
      });
      return false;
    }

    setActiveIfCurrent(callId, (prev) => ({
      ...prev,
      mediaEncryptionMode: "transport",
    }));
    pushNotice({ kind: "info", message: t("callSecurity.frameFallbackTransport") });
    return true;
  }, [
    activeRef,
    callSecurityMode,
    configureDirectCallFrameCrypto,
    debugCallMedia,
    ensureDirectCallSenderFrameCryptoBound,
    pushNotice,
    resetCallState,
    setActiveIfCurrent,
    t,
  ]);

  const toggleVideo = useDirectCallCameraToggle({
    activeRef,
    localStreamRef,
    peerConnectionRef,
    cameraSenderRef,
    screenShareSenderRef,
    negotiationReadyRef,
    renegotiationUnsupportedRef,
    pushNotice,
    ensureVideoSenders,
    syncVisualTransceiverBindings,
    syncVisualTransceiverDirections,
    syncLocalPreview,
    isCurrentActiveCallContext,
    setActiveIfCurrent,
    sendCallMediaState,
    syncOutgoingVisualMediaStateTrackBindings,
    clearOutgoingVisualMediaStateTrackBinding,
    sendRenegotiationOffer,
    t,
    ensureActiveDirectCallSenderFrameCrypto,
  });

  const {
    canSwitchCamera,
    isSwitchingCamera,
    switchCamera,
  } = useDirectCallCameraSwitch({
    active,
    activeRef,
    localStreamRef,
    peerConnectionRef,
    cameraSenderRef,
    pushNotice,
    ensureVideoSenders,
    syncVisualTransceiverBindings,
    syncLocalPreview,
    isCurrentActiveCallContext,
    syncOutgoingVisualMediaStateTrackBindings,
    debugCallMedia,
    t,
    ensureActiveDirectCallSenderFrameCrypto,
  });

  const {
    stopScreenShare,
    toggleScreenShare,
    selectedScreenResolution,
    handleSelectScreenResolution,
  } = useDirectCallScreenShareControls({
    activeRef,
    localStreamRef,
    peerConnectionRef,
    cameraSenderRef,
    screenShareTrackRef,
    screenShareSenderRef,
    screenShareTransceiverRef,
    negotiationReadyRef,
    renegotiationUnsupportedRef,
    lastSignalingErrorRef,
    debugCallMedia,
    pushNotice,
    recordLastRenegotiationAttempt,
    sendRenegotiationOffer,
    setActiveIfCurrent,
    isCurrentActiveCallContext,
    ensureVideoSenders,
    syncVisualTransceiverBindings,
    syncVisualTransceiverDirections,
    syncLocalPreview,
    syncLocalScreenPreview,
    sendCallMediaState,
    syncOutgoingVisualMediaStateTrackBindings,
    clearOutgoingVisualMediaStateTrackBinding,
    t,
    ensureActiveDirectCallSenderFrameCrypto,
  });

  return {
    canSwitchCamera,
    isSwitchingCamera,
    switchCamera,
    toggleVideo,
    toggleScreenShare,
    stopScreenShare: (reason?: DirectCallScreenShareStopReason) => stopScreenShare(reason),
    selectedScreenResolution,
    handleSelectScreenResolution,
  };
}

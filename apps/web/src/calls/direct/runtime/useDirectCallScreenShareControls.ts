import { useCallback } from "react";
import { logger } from "@/lib/logger.js";
import type { ActiveCall } from "@/calls/direct/model/direct-call-types";
import { hasRenderableVideoTrack, toScreenShareErrorMessage } from "@/calls/direct/model/direct-call-ui-utils";
import type {
  DirectCallScreenShareStopReason,
  DirectCallVisualMediaControlsOptions,
} from "./direct-call-media-controls-shared";

interface UseDirectCallScreenShareControlsOptions extends Pick<
  DirectCallVisualMediaControlsOptions,
  | "activeRef"
  | "localStreamRef"
  | "peerConnectionRef"
  | "cameraSenderRef"
  | "screenShareTrackRef"
  | "screenShareSenderRef"
  | "screenShareTransceiverRef"
  | "negotiationReadyRef"
  | "renegotiationUnsupportedRef"
  | "lastSignalingErrorRef"
  | "debugCallMedia"
  | "recordLastRenegotiationAttempt"
  | "sendRenegotiationOffer"
  | "setActiveIfCurrent"
  | "isCurrentActiveCallContext"
  | "ensureVideoSenders"
  | "syncVisualTransceiverBindings"
  | "syncVisualTransceiverDirections"
  | "syncLocalPreview"
  | "syncLocalScreenPreview"
  | "pushNotice"
  | "t"
  | "sendCallMediaState"
  | "syncOutgoingVisualMediaStateTrackBindings"
  | "clearOutgoingVisualMediaStateTrackBinding"
> {
  ensureActiveDirectCallSenderFrameCrypto: (callId: string, reason: string) => Promise<boolean>;
}

type StopScreenShare = (
  reason?: DirectCallScreenShareStopReason
) => Promise<void>;

interface StartScreenShareParams extends Pick<
  UseDirectCallScreenShareControlsOptions,
  | "cameraSenderRef"
  | "debugCallMedia"
  | "ensureVideoSenders"
  | "isCurrentActiveCallContext"
  | "negotiationReadyRef"
  | "pushNotice"
  | "recordLastRenegotiationAttempt"
  | "renegotiationUnsupportedRef"
  | "screenShareSenderRef"
  | "screenShareTrackRef"
  | "screenShareTransceiverRef"
  | "sendCallMediaState"
  | "sendRenegotiationOffer"
  | "setActiveIfCurrent"
  | "syncLocalPreview"
  | "syncLocalScreenPreview"
  | "syncOutgoingVisualMediaStateTrackBindings"
  | "syncVisualTransceiverBindings"
  | "syncVisualTransceiverDirections"
  | "t"
  | "ensureActiveDirectCallSenderFrameCrypto"
> {
  readonly currentActive: ActiveCall;
  readonly peerConnection: RTCPeerConnection;
  readonly stopScreenShare: StopScreenShare;
}

function recordScreenShareToggleRequested(
  currentActive: ActiveCall,
  options: Pick<
    UseDirectCallScreenShareControlsOptions,
    | "debugCallMedia"
    | "negotiationReadyRef"
    | "recordLastRenegotiationAttempt"
    | "renegotiationUnsupportedRef"
  >
): void {
  options.recordLastRenegotiationAttempt({
    callId: currentActive.callId,
    kind: "screen-share",
    action: currentActive.screenSharing ? "stop" : "start",
    stage: "requested",
    screenSharing: currentActive.screenSharing,
  });
  options.debugCallMedia("screen-share-toggle", {
    callId: currentActive.callId,
    action: currentActive.screenSharing ? "stop" : "start",
    screenSharing: currentActive.screenSharing,
    negotiationReady: options.negotiationReadyRef.current,
    renegotiationUnsupported: options.renegotiationUnsupportedRef.current,
  });
}

function notifyScreenShareUnsupported(
  currentActive: ActiveCall,
  options: Pick<
    UseDirectCallScreenShareControlsOptions,
    "pushNotice" | "recordLastRenegotiationAttempt" | "sendCallMediaState" | "t"
  >
): void {
  options.recordLastRenegotiationAttempt({
    callId: currentActive.callId,
    kind: "screen-share",
    action: "start",
    stage: "unsupported",
  });
  options.sendCallMediaState("screen", "off", currentActive.callId, "permission-denied");
  options.pushNotice({ kind: "error", message: options.t("call.error.screenDenied") });
}

async function attachScreenShareTrack({
  cameraSenderRef,
  currentActive,
  displayTrack,
  ensureActiveDirectCallSenderFrameCrypto,
  ensureVideoSenders,
  isCurrentActiveCallContext,
  peerConnection,
  recordLastRenegotiationAttempt,
  screenShareSenderRef,
  screenShareTrackRef,
  screenShareTransceiverRef,
  sendCallMediaState,
  sendRenegotiationOffer,
  setActiveIfCurrent,
  stopScreenShare,
  syncLocalPreview,
  syncLocalScreenPreview,
  syncOutgoingVisualMediaStateTrackBindings,
  syncVisualTransceiverBindings,
  syncVisualTransceiverDirections,
  negotiationReadyRef,
  renegotiationUnsupportedRef,
  t,
}: StartScreenShareParams & {
  readonly displayTrack: MediaStreamTrack;
}): Promise<void> {
  ensureVideoSenders(peerConnection);
  syncVisualTransceiverBindings();
  const senderFrameCryptoReady = await ensureActiveDirectCallSenderFrameCrypto(
    currentActive.callId,
    "screen-on"
  );
  if (!senderFrameCryptoReady) {
    displayTrack.stop();
    return;
  }
  const dedicatedScreenSender = screenShareSenderRef.current;
  if (!dedicatedScreenSender || dedicatedScreenSender === cameraSenderRef.current) {
    throw new Error(t("call.error.unableScreenShare"));
  }

  await dedicatedScreenSender.replaceTrack(displayTrack);
  recordLastRenegotiationAttempt({
    callId: currentActive.callId,
    kind: "screen-share",
    action: "start",
    stage: "track-attached",
    trackId: displayTrack.id,
  });
  screenShareTrackRef.current = displayTrack;
  if (!isCurrentActiveCallContext(currentActive.callId, peerConnection)) {
    displayTrack.stop();
    screenShareTrackRef.current = null;
    return;
  }
  if (screenShareTransceiverRef.current) {
    syncVisualTransceiverBindings();
  }
  syncLocalScreenPreview(displayTrack);
  syncOutgoingVisualMediaStateTrackBindings(currentActive.callId);
  displayTrack.addEventListener("ended", () => {
    if (screenShareTrackRef.current !== displayTrack) return;
    stopScreenShare("track-ended").catch((endedError) => {
      logger.warn("[CALL] failed to stop screen share after display track ended", endedError);
    });
  }, { once: true });
  syncLocalPreview();
  setActiveIfCurrent(currentActive.callId, (prev) => ({
    ...prev,
    callType: "video",
    screenSharing: true,
  }));
  sendCallMediaState("screen", "on", currentActive.callId, "user-toggle");
  syncVisualTransceiverDirections(currentActive.callId);
  if (negotiationReadyRef.current && !renegotiationUnsupportedRef.current) {
    await sendRenegotiationOffer(currentActive.callId, "screen-on");
  }
}

async function startScreenShare(params: StartScreenShareParams): Promise<void> {
  const { currentActive, recordLastRenegotiationAttempt, syncLocalScreenPreview, sendCallMediaState, pushNotice, screenShareTrackRef, t } = params;
  let displayTrack: MediaStreamTrack | null = null;
  try {
    recordLastRenegotiationAttempt({
      callId: currentActive.callId,
      kind: "screen-share",
      action: "start",
      stage: "requesting-display-media",
    });
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    displayTrack = displayStream.getVideoTracks()[0] ?? null;
    if (!displayTrack) {
      throw new Error(t("call.error.unableScreenShare"));
    }

    await attachScreenShareTrack({ ...params, displayTrack });
  } catch (error) {
    displayTrack?.stop();
    recordLastRenegotiationAttempt({
      callId: currentActive.callId,
      kind: "screen-share",
      action: "start",
      stage: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    screenShareTrackRef.current = null;
    syncLocalScreenPreview(null);
    sendCallMediaState("screen", "off", currentActive.callId, "permission-denied");
    pushNotice({ kind: "error", message: toScreenShareErrorMessage(error, t) });
  }
}

export function useDirectCallScreenShareControls({
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
  recordLastRenegotiationAttempt,
  sendRenegotiationOffer,
  setActiveIfCurrent,
  isCurrentActiveCallContext,
  ensureVideoSenders,
  syncVisualTransceiverBindings,
  syncVisualTransceiverDirections,
  syncLocalPreview,
  syncLocalScreenPreview,
  pushNotice,
  t,
  sendCallMediaState,
  syncOutgoingVisualMediaStateTrackBindings,
  clearOutgoingVisualMediaStateTrackBinding,
  ensureActiveDirectCallSenderFrameCrypto,
}: UseDirectCallScreenShareControlsOptions) {
  const stopScreenShare = useCallback(async (
    reason: DirectCallScreenShareStopReason = "user-toggle"
  ) => {
    const currentActive = activeRef.current;
    const screenTrack = screenShareTrackRef.current;
    const peerConnection = peerConnectionRef.current;

    if (!currentActive || !screenTrack) return;
    lastSignalingErrorRef.current = null;
    recordLastRenegotiationAttempt({
      callId: currentActive.callId,
      kind: "screen-share",
      action: "stop",
      stage: "stopping",
      reason,
      trackId: screenTrack.id,
    });
    debugCallMedia("screen-share-stop", {
      callId: currentActive.callId,
      reason,
      trackId: screenTrack.id,
    });

    const dedicatedScreenSender = screenShareSenderRef.current;
    screenShareTrackRef.current = null;
    clearOutgoingVisualMediaStateTrackBinding("screen");
    screenTrack.stop();

    if (dedicatedScreenSender) {
      await dedicatedScreenSender.replaceTrack(null);
    }
    if (!isCurrentActiveCallContext(currentActive.callId, peerConnection)) {
      return;
    }

    syncLocalScreenPreview(null);
    setActiveIfCurrent(currentActive.callId, (prev) => ({
      ...prev,
      callType: hasRenderableVideoTrack(localStreamRef.current, { requireEnabled: true })
        ? "video"
        : "audio",
      screenSharing: false,
    }));
    syncOutgoingVisualMediaStateTrackBindings(currentActive.callId);
    sendCallMediaState("screen", "off", currentActive.callId, reason);
    syncVisualTransceiverDirections(currentActive.callId);
    if (negotiationReadyRef.current && !renegotiationUnsupportedRef.current) {
      await sendRenegotiationOffer(currentActive.callId, "screen-off");
    }
  }, [
    activeRef,
    clearOutgoingVisualMediaStateTrackBinding,
    debugCallMedia,
    isCurrentActiveCallContext,
    lastSignalingErrorRef,
    localStreamRef,
    negotiationReadyRef,
    peerConnectionRef,
    recordLastRenegotiationAttempt,
    renegotiationUnsupportedRef,
    screenShareSenderRef,
    screenShareTrackRef,
    sendCallMediaState,
    sendRenegotiationOffer,
    setActiveIfCurrent,
    syncLocalScreenPreview,
    syncOutgoingVisualMediaStateTrackBindings,
    syncVisualTransceiverDirections,
  ]);

  const toggleScreenShare = useCallback(async () => {
    const currentActive = activeRef.current;
    const peerConnection = peerConnectionRef.current;

    if (!currentActive || !peerConnection) return;
    lastSignalingErrorRef.current = null;
    recordScreenShareToggleRequested(currentActive, {
      debugCallMedia,
      negotiationReadyRef,
      recordLastRenegotiationAttempt,
      renegotiationUnsupportedRef,
    });
    if (negotiationReadyRef.current && renegotiationUnsupportedRef.current) {
      pushNotice({ kind: "info", message: "Peer does not support in-call screen-share renegotiation. Reload both tabs." });
      return;
    }

    if (currentActive.screenSharing) {
      try {
        await stopScreenShare("user-toggle");
      } catch (error) {
        pushNotice({ kind: "error", message: toScreenShareErrorMessage(error, t) });
      }
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      notifyScreenShareUnsupported(currentActive, {
        pushNotice,
        recordLastRenegotiationAttempt,
        sendCallMediaState,
        t,
      });
      return;
    }

    await startScreenShare({
      cameraSenderRef,
      currentActive,
      debugCallMedia,
      ensureActiveDirectCallSenderFrameCrypto,
      ensureVideoSenders,
      isCurrentActiveCallContext,
      negotiationReadyRef,
      peerConnection,
      pushNotice,
      recordLastRenegotiationAttempt,
      renegotiationUnsupportedRef,
      screenShareSenderRef,
      screenShareTrackRef,
      screenShareTransceiverRef,
      sendCallMediaState,
      sendRenegotiationOffer,
      setActiveIfCurrent,
      stopScreenShare,
      syncLocalPreview,
      syncLocalScreenPreview,
      syncOutgoingVisualMediaStateTrackBindings,
      syncVisualTransceiverBindings,
      syncVisualTransceiverDirections,
      t,
    });
  }, [
    activeRef,
    cameraSenderRef,
    debugCallMedia,
    ensureActiveDirectCallSenderFrameCrypto,
    ensureVideoSenders,
    isCurrentActiveCallContext,
    lastSignalingErrorRef,
    negotiationReadyRef,
    peerConnectionRef,
    pushNotice,
    recordLastRenegotiationAttempt,
    renegotiationUnsupportedRef,
    screenShareSenderRef,
    screenShareTrackRef,
    screenShareTransceiverRef,
    sendCallMediaState,
    sendRenegotiationOffer,
    setActiveIfCurrent,
    stopScreenShare,
    syncLocalPreview,
    syncLocalScreenPreview,
    syncOutgoingVisualMediaStateTrackBindings,
    syncVisualTransceiverBindings,
    syncVisualTransceiverDirections,
    t,
  ]);

  return {
    stopScreenShare,
    toggleScreenShare,
  };
}

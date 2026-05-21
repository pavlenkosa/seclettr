import { useCallback } from "react";
import { toMediaErrorMessage } from "@/calls/direct/model/direct-call-ui-utils";
import type { ActiveCall } from "@/calls/direct/model/direct-call-types";
import type { DirectCallVisualMediaControlsOptions } from "./direct-call-media-controls-shared";

interface UseDirectCallCameraToggleOptions extends Pick<
  DirectCallVisualMediaControlsOptions,
  | "activeRef"
  | "localStreamRef"
  | "peerConnectionRef"
  | "cameraSenderRef"
  | "screenShareSenderRef"
  | "negotiationReadyRef"
  | "renegotiationUnsupportedRef"
  | "pushNotice"
  | "ensureVideoSenders"
  | "syncVisualTransceiverBindings"
  | "syncVisualTransceiverDirections"
  | "syncLocalPreview"
  | "isCurrentActiveCallContext"
  | "setActiveIfCurrent"
  | "sendCallMediaState"
  | "syncOutgoingVisualMediaStateTrackBindings"
  | "clearOutgoingVisualMediaStateTrackBinding"
  | "sendRenegotiationOffer"
  | "t"
> {
  ensureActiveDirectCallSenderFrameCrypto: (callId: string, reason: string) => Promise<boolean>;
}

interface ToggleCameraOffParams extends Pick<
  UseDirectCallCameraToggleOptions,
  | "cameraSenderRef"
  | "clearOutgoingVisualMediaStateTrackBinding"
  | "isCurrentActiveCallContext"
  | "negotiationReadyRef"
  | "renegotiationUnsupportedRef"
  | "sendCallMediaState"
  | "sendRenegotiationOffer"
  | "setActiveIfCurrent"
  | "syncLocalPreview"
  | "syncOutgoingVisualMediaStateTrackBindings"
  | "syncVisualTransceiverDirections"
> {
  readonly currentActive: ActiveCall;
  readonly currentVideoTrack: MediaStreamTrack;
  readonly localStream: MediaStream;
  readonly peerConnection: RTCPeerConnection;
}

interface ToggleCameraOnParams extends Pick<
  UseDirectCallCameraToggleOptions,
  | "cameraSenderRef"
  | "isCurrentActiveCallContext"
  | "negotiationReadyRef"
  | "pushNotice"
  | "renegotiationUnsupportedRef"
  | "screenShareSenderRef"
  | "sendCallMediaState"
  | "sendRenegotiationOffer"
  | "setActiveIfCurrent"
  | "syncLocalPreview"
  | "syncOutgoingVisualMediaStateTrackBindings"
  | "syncVisualTransceiverDirections"
  | "t"
> {
  readonly currentActive: ActiveCall;
  readonly localStream: MediaStream;
  readonly peerConnection: RTCPeerConnection;
}

async function toggleCameraOff({
  cameraSenderRef,
  clearOutgoingVisualMediaStateTrackBinding,
  currentActive,
  currentVideoTrack,
  isCurrentActiveCallContext,
  localStream,
  negotiationReadyRef,
  peerConnection,
  renegotiationUnsupportedRef,
  sendCallMediaState,
  sendRenegotiationOffer,
  setActiveIfCurrent,
  syncLocalPreview,
  syncOutgoingVisualMediaStateTrackBindings,
  syncVisualTransceiverDirections,
}: ToggleCameraOffParams): Promise<void> {
  clearOutgoingVisualMediaStateTrackBinding("camera");
  currentVideoTrack.stop();
  localStream.removeTrack(currentVideoTrack);
  if (cameraSenderRef.current) {
    await cameraSenderRef.current.replaceTrack(null);
  }
  if (!isCurrentActiveCallContext(currentActive.callId, peerConnection)) {
    return;
  }
  syncLocalPreview();
  setActiveIfCurrent(currentActive.callId, (prev) => ({
    ...prev,
    videoOff: true,
    callType: prev.screenSharing ? "video" : "audio",
  }));
  syncOutgoingVisualMediaStateTrackBindings(currentActive.callId);
  sendCallMediaState("camera", "off", currentActive.callId, "user-toggle");
  syncVisualTransceiverDirections(currentActive.callId);
  if (negotiationReadyRef.current && !renegotiationUnsupportedRef.current) {
    await sendRenegotiationOffer(currentActive.callId, "camera-off");
  }
}

async function toggleCameraOn({
  cameraSenderRef,
  currentActive,
  isCurrentActiveCallContext,
  localStream,
  negotiationReadyRef,
  peerConnection,
  pushNotice,
  renegotiationUnsupportedRef,
  screenShareSenderRef,
  sendCallMediaState,
  sendRenegotiationOffer,
  setActiveIfCurrent,
  syncLocalPreview,
  syncOutgoingVisualMediaStateTrackBindings,
  syncVisualTransceiverDirections,
  t,
}: ToggleCameraOnParams): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    sendCallMediaState("camera", "off", currentActive.callId, "permission-denied");
    pushNotice({ kind: "error", message: t("call.error.noCameraMic") });
    return;
  }

  let nextVideoTrack: MediaStreamTrack | null = null;
  try {
    const cameraStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: "user",
      },
    });
    nextVideoTrack = cameraStream.getVideoTracks()[0] ?? null;
    if (!nextVideoTrack) {
      throw new Error(t("call.error.noCameraMic"));
    }

    const dedicatedCameraSender = cameraSenderRef.current;
    if (!dedicatedCameraSender || dedicatedCameraSender === screenShareSenderRef.current) {
      throw new Error(t("call.error.unableStart"));
    }
    await dedicatedCameraSender.replaceTrack(nextVideoTrack);
    if (!isCurrentActiveCallContext(currentActive.callId, peerConnection)) {
      nextVideoTrack.stop();
      return;
    }
    localStream.addTrack(nextVideoTrack);
    syncLocalPreview();
    setActiveIfCurrent(currentActive.callId, (prev) => ({
      ...prev,
      videoOff: false,
      callType: "video",
    }));
    syncOutgoingVisualMediaStateTrackBindings(currentActive.callId);
    sendCallMediaState("camera", "on", currentActive.callId, "user-toggle");
    syncVisualTransceiverDirections(currentActive.callId);
    if (negotiationReadyRef.current && !renegotiationUnsupportedRef.current) {
      await sendRenegotiationOffer(currentActive.callId, "camera-on");
    }
  } catch (error) {
    nextVideoTrack?.stop();
    sendCallMediaState("camera", "off", currentActive.callId, "permission-denied");
    pushNotice({ kind: "error", message: toMediaErrorMessage(error, "video", t) });
  }
}

export function useDirectCallCameraToggle({
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
}: UseDirectCallCameraToggleOptions) {
  return useCallback(async () => {
    const currentActive = activeRef.current;
    const localStream = localStreamRef.current;
    const peerConnection = peerConnectionRef.current;
    if (!currentActive || !localStream || !peerConnection) return;
    if (negotiationReadyRef.current && renegotiationUnsupportedRef.current) {
      pushNotice({ kind: "info", message: "Peer does not support in-call video renegotiation. Reload both tabs." });
      return;
    }
    ensureVideoSenders(peerConnection);
    syncVisualTransceiverBindings();

    const currentVideoTrack = localStream.getVideoTracks()[0] ?? null;
    const senderFrameCryptoReady = await ensureActiveDirectCallSenderFrameCrypto(
      currentActive.callId,
      currentVideoTrack ? "camera-off" : "camera-on"
    );
    if (!senderFrameCryptoReady) {
      return;
    }
    if (currentVideoTrack) {
      await toggleCameraOff({
        cameraSenderRef,
        clearOutgoingVisualMediaStateTrackBinding,
        currentActive,
        currentVideoTrack,
        isCurrentActiveCallContext,
        localStream,
        negotiationReadyRef,
        peerConnection,
        renegotiationUnsupportedRef,
        sendCallMediaState,
        sendRenegotiationOffer,
        setActiveIfCurrent,
        syncLocalPreview,
        syncOutgoingVisualMediaStateTrackBindings,
        syncVisualTransceiverDirections,
      });
      return;
    }

    await toggleCameraOn({
      cameraSenderRef,
      currentActive,
      isCurrentActiveCallContext,
      localStream,
      negotiationReadyRef,
      peerConnection,
      pushNotice,
      renegotiationUnsupportedRef,
      screenShareSenderRef,
      sendCallMediaState,
      sendRenegotiationOffer,
      setActiveIfCurrent,
      syncLocalPreview,
      syncOutgoingVisualMediaStateTrackBindings,
      syncVisualTransceiverDirections,
      t,
    });
  }, [
    activeRef,
    cameraSenderRef,
    clearOutgoingVisualMediaStateTrackBinding,
    ensureActiveDirectCallSenderFrameCrypto,
    ensureVideoSenders,
    isCurrentActiveCallContext,
    localStreamRef,
    negotiationReadyRef,
    peerConnectionRef,
    pushNotice,
    renegotiationUnsupportedRef,
    screenShareSenderRef,
    sendCallMediaState,
    sendRenegotiationOffer,
    setActiveIfCurrent,
    syncLocalPreview,
    syncOutgoingVisualMediaStateTrackBindings,
    syncVisualTransceiverBindings,
    syncVisualTransceiverDirections,
    t,
  ]);
}

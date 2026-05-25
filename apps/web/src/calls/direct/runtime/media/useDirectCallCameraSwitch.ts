import {
  useCallback,
  useEffect,
  useState,
} from "react";
import { toMediaErrorMessage } from "@/calls/direct/model/direct-call-ui-utils";
import type { DirectCallVisualMediaControlsOptions } from "./direct-call-media-controls-shared";

interface UseDirectCallCameraSwitchOptions extends Pick<
  DirectCallVisualMediaControlsOptions,
  | "active"
  | "activeRef"
  | "localStreamRef"
  | "peerConnectionRef"
  | "cameraSenderRef"
  | "pushNotice"
  | "ensureVideoSenders"
  | "syncVisualTransceiverBindings"
  | "syncLocalPreview"
  | "isCurrentActiveCallContext"
  | "syncOutgoingVisualMediaStateTrackBindings"
  | "debugCallMedia"
  | "t"
> {
  ensureActiveDirectCallSenderFrameCrypto: (callId: string, reason: string) => Promise<boolean>;
}

function listVideoInputs(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
  return devices.filter((device) => device.kind === "videoinput");
}

function resolveNextCameraConstraint(
  currentTrack: MediaStreamTrack,
  devices: MediaDeviceInfo[]
): MediaTrackConstraints | null {
  if (devices.length < 2) {
    const currentFacingMode = currentTrack.getSettings?.().facingMode;
    if (currentFacingMode === "user") {
      return { facingMode: { ideal: "environment" } };
    }
    if (currentFacingMode === "environment") {
      return { facingMode: { ideal: "user" } };
    }
    return null;
  }

  const currentDeviceId = currentTrack.getSettings?.().deviceId;
  const currentIndex = currentDeviceId
    ? devices.findIndex((device) => device.deviceId === currentDeviceId)
    : -1;

  if (currentIndex >= 0) {
    const nextDevice = devices[(currentIndex + 1) % devices.length] ?? null;
    return nextDevice?.deviceId
      ? { deviceId: { exact: nextDevice.deviceId } }
      : null;
  }

  const currentLabel = currentTrack.label.trim();
  const labelIndex = currentLabel
    ? devices.findIndex((device) => device.label.trim() === currentLabel)
    : -1;

  if (labelIndex >= 0) {
    const nextDevice = devices[(labelIndex + 1) % devices.length] ?? null;
    return nextDevice?.deviceId
      ? { deviceId: { exact: nextDevice.deviceId } }
      : null;
  }

  const fallbackDevice = devices[1] ?? devices[0] ?? null;
  return fallbackDevice?.deviceId
    ? { deviceId: { exact: fallbackDevice.deviceId } }
    : null;
}

export function useDirectCallCameraSwitch({
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
}: UseDirectCallCameraSwitchOptions) {
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    const supportsRuntimeSwitch = Boolean(
      active &&
      !active.videoOff &&
      mediaDevices &&
      typeof mediaDevices.enumerateDevices === "function" &&
      typeof mediaDevices.getUserMedia === "function"
    );

    if (!supportsRuntimeSwitch) {
      setCanSwitchCamera(false);
      return;
    }

    let cancelled = false;

    const refreshAvailability = async () => {
      try {
        const devices = await mediaDevices.enumerateDevices();
        if (!cancelled) {
          const currentTrack = localStreamRef.current?.getVideoTracks?.()[0] ?? null;
          const videoInputs = listVideoInputs(devices);
          const hasFacingModeFallback = Boolean(currentTrack?.getSettings?.().facingMode);
          setCanSwitchCamera(videoInputs.length > 1 || hasFacingModeFallback);
        }
      } catch {
        if (!cancelled) {
          setCanSwitchCamera(false);
        }
      }
    };

    void refreshAvailability();

    if (!mediaDevices.addEventListener) {
      return () => {
        cancelled = true;
      };
    }

    const handleDeviceChange = () => {
      void refreshAvailability();
    };

    mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      cancelled = true;
      mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [active, localStreamRef]);

  const switchCamera = useCallback(async () => {
    const currentActive = activeRef.current;
    const localStream = localStreamRef.current;
    const peerConnection = peerConnectionRef.current;
    const currentVideoTrack = localStream?.getVideoTracks()[0] ?? null;
    const mediaDevices = navigator.mediaDevices;

    if (
      !currentActive ||
      !localStream ||
      !peerConnection ||
      !currentVideoTrack ||
      !mediaDevices?.enumerateDevices ||
      !mediaDevices.getUserMedia ||
      isSwitchingCamera
    ) {
      return;
    }

    ensureVideoSenders(peerConnection);
    syncVisualTransceiverBindings();
    const dedicatedCameraSender = cameraSenderRef.current;
    if (!dedicatedCameraSender) {
      pushNotice({ kind: "error", message: t("call.error.unableStart") });
      return;
    }

    setIsSwitchingCamera(true);
    let nextVideoTrack: MediaStreamTrack | null = null;

    try {
      const senderFrameCryptoReady = await ensureActiveDirectCallSenderFrameCrypto(
        currentActive.callId,
        "camera-switch"
      );
      if (!senderFrameCryptoReady) {
        return;
      }

      const devices = await mediaDevices.enumerateDevices();
      const videoInputs = listVideoInputs(devices);
      const nextConstraint = resolveNextCameraConstraint(currentVideoTrack, videoInputs);
      if (!nextConstraint) {
        setCanSwitchCamera(false);
        return;
      }

      const nextCameraStream = await mediaDevices.getUserMedia({
        audio: false,
        video: nextConstraint,
      });
      nextVideoTrack = nextCameraStream.getVideoTracks()[0] ?? null;
      if (!nextVideoTrack) {
        throw new Error(t("call.error.noCameraMic"));
      }

      // Reuse the existing dedicated sender so the peer keeps the same video
      // slot and the camera swap does not force a renegotiation.
      await dedicatedCameraSender.replaceTrack(nextVideoTrack);
      if (!isCurrentActiveCallContext(currentActive.callId, peerConnection)) {
        nextVideoTrack.stop();
        return;
      }

      localStream.removeTrack(currentVideoTrack);
      currentVideoTrack.stop();
      localStream.addTrack(nextVideoTrack);
      syncLocalPreview();
      syncOutgoingVisualMediaStateTrackBindings(currentActive.callId);
      debugCallMedia("camera-switch-complete", {
        callId: currentActive.callId,
        nextDeviceId: nextVideoTrack.getSettings?.().deviceId ?? null,
        nextFacingMode: nextVideoTrack.getSettings?.().facingMode ?? null,
      });
      setCanSwitchCamera(true);
    } catch (error) {
      nextVideoTrack?.stop();
      pushNotice({ kind: "error", message: toMediaErrorMessage(error, "video", t) });
    } finally {
      setIsSwitchingCamera(false);
    }
  }, [
    activeRef,
    cameraSenderRef,
    debugCallMedia,
    ensureActiveDirectCallSenderFrameCrypto,
    ensureVideoSenders,
    isCurrentActiveCallContext,
    isSwitchingCamera,
    localStreamRef,
    peerConnectionRef,
    pushNotice,
    syncLocalPreview,
    syncOutgoingVisualMediaStateTrackBindings,
    syncVisualTransceiverBindings,
    t,
  ]);

  return {
    canSwitchCamera,
    isSwitchingCamera,
    switchCamera,
  };
}

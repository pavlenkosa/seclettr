import { useMemo } from "react";
import type { DirectCallMediaEncryptionMode } from "@/calls/direct/model/call-media-encryption-negotiation";
import { isRemoteMediaSlotRenderable, type RemoteMediaSlot } from "@/calls/direct/model/call-media-slots";
import { hasRenderableVideoTrack } from "@/calls/direct/model/direct-call-ui-utils";
import type { ActiveCall } from "@/calls/direct/model/direct-call-types";

interface UseDirectCallVisualStateSummaryOptions {
  active: ActiveCall | null;
  localStream: MediaStream | null;
  remoteCameraSlot: RemoteMediaSlot;
  remoteScreenSlot: RemoteMediaSlot;
  localSupportedMediaEncryptionModes: DirectCallMediaEncryptionMode[];
}

interface UseDirectCallVisualStateSummaryResult {
  hasLiveLocalCameraTrack: boolean;
  hasRenderableRemoteCamera: boolean;
  hasRenderableRemoteScreen: boolean;
  hasRemoteVisualMedia: boolean;
  isVideoCallActive: boolean;
  hasAnyVisualMedia: boolean;
  shouldRenderLocalCameraPreview: boolean;
  localSupportsFrameEncryption: boolean;
}

export function useDirectCallVisualState({
  active,
  localStream,
  remoteCameraSlot,
  remoteScreenSlot,
  localSupportedMediaEncryptionModes,
}: UseDirectCallVisualStateSummaryOptions): UseDirectCallVisualStateSummaryResult {
  return useMemo(() => {
    const hasLiveLocalCameraTrack = hasRenderableVideoTrack(localStream, {
      requireEnabled: true,
      requireUnmuted: true,
    });
    const isRemoteMediaPhaseActive = active?.state === "active";
    const hasRenderableRemoteCamera = Boolean(
      isRemoteMediaPhaseActive && isRemoteMediaSlotRenderable(remoteCameraSlot)
    );
    const hasRenderableRemoteScreen = Boolean(
      isRemoteMediaPhaseActive && isRemoteMediaSlotRenderable(remoteScreenSlot)
    );
    const hasRemoteVisualMedia = hasRenderableRemoteCamera || hasRenderableRemoteScreen;
    const isVideoCallActive = Boolean(
      active &&
      (
        !active.videoOff ||
        active.screenSharing
      )
    );
    const hasAnyVisualMedia = Boolean(
      active &&
      (
        hasLiveLocalCameraTrack ||
        active.screenSharing ||
        hasRemoteVisualMedia
      )
    );
    const shouldRenderLocalCameraPreview = Boolean(
      active &&
      isVideoCallActive &&
      hasLiveLocalCameraTrack
    );
    const localSupportsFrameEncryption = localSupportedMediaEncryptionModes.includes("frame-v1");

    return {
      hasLiveLocalCameraTrack,
      hasRenderableRemoteCamera,
      hasRenderableRemoteScreen,
      hasRemoteVisualMedia,
      isVideoCallActive,
      hasAnyVisualMedia,
      shouldRenderLocalCameraPreview,
      localSupportsFrameEncryption,
    };
  }, [
    active,
    localStream,
    localSupportedMediaEncryptionModes,
    remoteCameraSlot,
    remoteScreenSlot,
  ]);
}

import { useEffect, useLayoutEffect, type MutableRefObject } from "react";

interface UseDirectCallMediaElementBindingsOptions {
  activeCallId: string | null;
  isMinimized: boolean;
  isVideoCallActive: boolean;
  hasRenderableRemoteCamera: boolean;
  hasRenderableRemoteScreen: boolean;
  remoteVideoReady: boolean;
  remoteScreenReady: boolean;
  localVideoRef: MutableRefObject<HTMLVideoElement | null>;
  localScreenPreviewRef: MutableRefObject<HTMLVideoElement | null>;
  remoteVideoRef: MutableRefObject<HTMLVideoElement | null>;
  remoteVideoCompanionRef: MutableRefObject<HTMLVideoElement | null>;
  remoteScreenVideoRef: MutableRefObject<HTMLVideoElement | null>;
  remoteScreenCompanionRef: MutableRefObject<HTMLVideoElement | null>;
  remoteCameraProbeRef: MutableRefObject<HTMLVideoElement | null>;
  remoteScreenProbeRef: MutableRefObject<HTMLVideoElement | null>;
  remoteAudioRef: MutableRefObject<HTMLAudioElement | null>;
  localStreamRef: MutableRefObject<MediaStream | null>;
  localScreenPreviewStreamRef: MutableRefObject<MediaStream | null>;
  remoteAudioStreamRef: MutableRefObject<MediaStream | null>;
  remoteCameraStreamRef: MutableRefObject<MediaStream | null>;
  remoteScreenStreamRef: MutableRefObject<MediaStream | null>;
  remoteCameraSlotStream: MediaStream | null;
  remoteCameraSlotTrackId: string | null;
  remoteScreenSlotStream: MediaStream | null;
  remoteScreenSlotTrackId: string | null;
  refreshRemoteVideoTracksFromPeer: (callIdOverride?: string, reason?: string) => void;
}

function bindMediaStream(
  element: HTMLMediaElement | null,
  stream: MediaStream | null,
  shouldPlay = true
) {
  if (!element) {
    return;
  }
  if (element.srcObject !== stream) {
    element.srcObject = stream;
  }
  if (shouldPlay && stream) {
    element.play().catch(() => {});
  }
}

export function useDirectCallMediaElementBindings({
  activeCallId,
  isMinimized,
  isVideoCallActive,
  hasRenderableRemoteCamera,
  hasRenderableRemoteScreen,
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
  remoteCameraSlotStream,
  remoteCameraSlotTrackId,
  remoteScreenSlotStream,
  remoteScreenSlotTrackId,
  refreshRemoteVideoTracksFromPeer,
}: UseDirectCallMediaElementBindingsOptions) {
  useEffect(() => {
    if (!activeCallId) return;
    refreshRemoteVideoTracksFromPeer(activeCallId, "active-call-change");
  }, [activeCallId, refreshRemoteVideoTracksFromPeer]);

  useEffect(() => {
    if (!activeCallId) return;

    bindMediaStream(remoteCameraProbeRef.current, remoteCameraSlotStream);
    bindMediaStream(remoteScreenProbeRef.current, remoteScreenSlotStream);
  }, [
    activeCallId,
    remoteCameraProbeRef,
    remoteCameraSlotStream,
    remoteCameraSlotTrackId,
    remoteScreenProbeRef,
    remoteScreenSlotStream,
    remoteScreenSlotTrackId,
  ]);

  useLayoutEffect(() => {
    if (!activeCallId) return;

    bindMediaStream(remoteAudioRef.current, remoteAudioStreamRef.current);

    if (!isMinimized) {
      if (isVideoCallActive) {
        bindMediaStream(localVideoRef.current, localStreamRef.current);
        bindMediaStream(localScreenPreviewRef.current, localScreenPreviewStreamRef.current);
      }
    }

    const nextRemoteCameraStream = hasRenderableRemoteCamera ? remoteCameraStreamRef.current : null;
    bindMediaStream(remoteVideoRef.current, nextRemoteCameraStream);
    bindMediaStream(remoteVideoCompanionRef.current, nextRemoteCameraStream);

    const nextRemoteScreenStream = hasRenderableRemoteScreen ? remoteScreenStreamRef.current : null;
    bindMediaStream(remoteScreenVideoRef.current, nextRemoteScreenStream);
    bindMediaStream(remoteScreenCompanionRef.current, nextRemoteScreenStream);
    // Stage/companion surfaces mount and unmount as the presentation scene changes.
    // Re-running after each render keeps newly mounted playback elements bound to the live streams.
  });
}

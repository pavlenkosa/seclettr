import { useCallback, type MutableRefObject, type RefObject } from "react";
import type { DirectCallVisualMediaSource } from "@/calls/direct/model/call-media-state";
import {
  ensureDedicatedVideoTransceivers,
  reconcileDedicatedVideoTransceivers,
} from "@/calls/direct/model/call-visual-transceivers";

type DebugCallMedia = (event: string, payload: Record<string, unknown>) => void;

interface UseDirectCallLocalMediaParams {
  peerConnectionRef: MutableRefObject<RTCPeerConnection | null>;
  cameraTransceiverRef: MutableRefObject<RTCRtpTransceiver | null>;
  screenShareTransceiverRef: MutableRefObject<RTCRtpTransceiver | null>;
  cameraSenderRef: MutableRefObject<RTCRtpSender | null>;
  screenShareSenderRef: MutableRefObject<RTCRtpSender | null>;
  localStreamRef: MutableRefObject<MediaStream | null>;
  screenShareTrackRef: MutableRefObject<MediaStreamTrack | null>;
  localVideoRef: RefObject<HTMLVideoElement | null>;
  localScreenPreviewRef: RefObject<HTMLVideoElement | null>;
  localScreenPreviewStreamRef: MutableRefObject<MediaStream | null>;
  remoteReceiverSlotBindingsRef: MutableRefObject<Map<string, DirectCallVisualMediaSource>>;
  debugCallMedia: DebugCallMedia;
}

export function useDirectCallLocalMedia({
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
}: UseDirectCallLocalMediaParams) {
  const ensureVideoSenders = useCallback((pc: RTCPeerConnection) => {
    const { cameraTransceiver, screenTransceiver } = ensureDedicatedVideoTransceivers({
      pc,
      currentCameraTransceiver: cameraTransceiverRef.current,
      currentScreenTransceiver: screenShareTransceiverRef.current,
    });

    cameraTransceiverRef.current = cameraTransceiver;
    cameraSenderRef.current = cameraTransceiver.sender;
    screenShareTransceiverRef.current = screenTransceiver;
    screenShareSenderRef.current = screenTransceiver.sender;
  }, [
    cameraSenderRef,
    cameraTransceiverRef,
    screenShareSenderRef,
    screenShareTransceiverRef,
  ]);

  const syncVisualTransceiverBindings = useCallback(() => {
    const pc = peerConnectionRef.current;
    if (pc) {
      const reconciled = reconcileDedicatedVideoTransceivers({
        pc,
        currentCameraTransceiver: cameraTransceiverRef.current,
        currentScreenTransceiver: screenShareTransceiverRef.current,
      });
      cameraTransceiverRef.current = reconciled.cameraTransceiver;
      cameraSenderRef.current = reconciled.cameraTransceiver?.sender ?? null;
      screenShareTransceiverRef.current = reconciled.screenTransceiver;
      screenShareSenderRef.current = reconciled.screenTransceiver?.sender ?? null;
    }

    const nextBindings = new Map<string, DirectCallVisualMediaSource>();
    const cameraMid = cameraTransceiverRef.current?.mid;
    const screenMid = screenShareTransceiverRef.current?.mid;
    if (cameraMid) {
      nextBindings.set(cameraMid, "camera");
    }
    if (screenMid && screenMid !== cameraMid) {
      nextBindings.set(screenMid, "screen");
    }
    remoteReceiverSlotBindingsRef.current = nextBindings;
  }, [
    cameraSenderRef,
    cameraTransceiverRef,
    peerConnectionRef,
    remoteReceiverSlotBindingsRef,
    screenShareSenderRef,
    screenShareTransceiverRef,
  ]);

  const attachLocalTracksToPeer = useCallback(async (pc: RTCPeerConnection, stream: MediaStream) => {
    const localAudioTrack = stream.getAudioTracks()[0] ?? null;
    if (localAudioTrack) {
      const audioSender = pc.getSenders().find((sender) => sender.track?.kind === "audio");
      if (audioSender) {
        await audioSender.replaceTrack(localAudioTrack);
      } else {
        pc.addTrack(localAudioTrack, stream);
      }
    }

    ensureVideoSenders(pc);
    const localVideoTrack = stream.getVideoTracks()[0] ?? null;
    const dedicatedCameraSender = cameraSenderRef.current;
    if (!dedicatedCameraSender) {
      throw new Error("Dedicated camera sender unavailable");
    }
    await dedicatedCameraSender.replaceTrack(localVideoTrack);
  }, [cameraSenderRef, ensureVideoSenders]);

  const syncVisualTransceiverDirections = useCallback((callId: string) => {
    const localCameraTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
    const localScreenTrack = screenShareTrackRef.current;

    const syncDirection = (
      transceiver: RTCRtpTransceiver | null,
      source: DirectCallVisualMediaSource,
      hasLocalTrack: boolean
    ) => {
      if (!transceiver) return;
      const nextDirection: RTCRtpTransceiverDirection = hasLocalTrack ? "sendrecv" : "recvonly";
      if (transceiver.direction === nextDirection) {
        return;
      }
      transceiver.direction = nextDirection;
      debugCallMedia("transceiver-direction-updated", {
        callId,
        source,
        direction: nextDirection,
        mid: transceiver.mid ?? null,
      });
    };

    syncDirection(cameraTransceiverRef.current, "camera", Boolean(localCameraTrack));
    syncDirection(screenShareTransceiverRef.current, "screen", Boolean(localScreenTrack));
  }, [
    cameraTransceiverRef,
    debugCallMedia,
    localStreamRef,
    screenShareTrackRef,
    screenShareTransceiverRef,
  ]);

  const requestLocalStream = useCallback(async (
    options?: { withVideo?: boolean }
  ): Promise<MediaStream> => {
    const withVideo = !!(options?.withVideo);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: withVideo,
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play().catch(() => {});
    }
    return stream;
  }, [localStreamRef, localVideoRef]);

  const syncLocalPreview = useCallback(() => {
    if (!localVideoRef.current || !localStreamRef.current) return;
    localVideoRef.current.srcObject = localStreamRef.current;
    localVideoRef.current.play().catch(() => {});
  }, [localStreamRef, localVideoRef]);

  const syncLocalScreenPreview = useCallback((track: MediaStreamTrack | null) => {
    if (!track) {
      localScreenPreviewStreamRef.current = null;
      if (localScreenPreviewRef.current) {
        localScreenPreviewRef.current.srcObject = null;
      }
      return;
    }
    const previewStream = new MediaStream([track]);
    localScreenPreviewStreamRef.current = previewStream;
    if (!localScreenPreviewRef.current) return;
    localScreenPreviewRef.current.srcObject = previewStream;
    localScreenPreviewRef.current.play().catch(() => {});
  }, [localScreenPreviewRef, localScreenPreviewStreamRef]);

  return {
    ensureVideoSenders,
    syncVisualTransceiverBindings,
    attachLocalTracksToPeer,
    syncVisualTransceiverDirections,
    requestLocalStream,
    syncLocalPreview,
    syncLocalScreenPreview,
  };
}

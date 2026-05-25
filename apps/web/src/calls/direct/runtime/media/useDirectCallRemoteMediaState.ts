import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  createEmptyRemoteMediaSlot,
  toRemoteMediaUiStatus,
  type RemoteMediaSlot,
  type RemoteMediaSource,
  type RemoteMediaUiStatus,
} from "@/calls/direct/model/call-media-slots";
import {
  REMOTE_MIN_FRAME_DIMENSION,
} from "@/calls/direct/model/direct-call-types";
import type {
  DirectCallRemoteMediaStateResult,
  UseDirectCallRemoteMediaRuntimeOptions,
} from "./direct-call-remote-media-runtime-shared";

interface UseDirectCallRemoteMediaStateOptions extends Pick<
  UseDirectCallRemoteMediaRuntimeOptions,
  | "activeCallId"
  | "debugCallMedia"
> {}

const VIDEO_READINESS_EVENTS = ["canplay", "loadeddata", "resize"] as const;

function isElementReadyForStream(
  element: HTMLVideoElement | null,
  stream: MediaStream | null
): boolean {
  if (!element || !stream || element.srcObject !== stream) return false;
  return (
    element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    element.videoWidth >= REMOTE_MIN_FRAME_DIMENSION &&
    element.videoHeight >= REMOTE_MIN_FRAME_DIMENSION
  );
}

function bindVideoReadinessListeners(
  elements: HTMLVideoElement[],
  callback: () => void
): () => void {
  for (const element of elements) {
    for (const eventName of VIDEO_READINESS_EVENTS) {
      element.addEventListener(eventName, callback);
    }
  }
  return () => {
    for (const element of elements) {
      for (const eventName of VIDEO_READINESS_EVENTS) {
        element.removeEventListener(eventName, callback);
      }
    }
  };
}

export function useDirectCallRemoteMediaState({
  activeCallId,
  debugCallMedia,
}: UseDirectCallRemoteMediaStateOptions): DirectCallRemoteMediaStateResult {
  const [remoteCameraSlot, setRemoteCameraSlot] = useState<RemoteMediaSlot>(() =>
    createEmptyRemoteMediaSlot("camera")
  );
  const [remoteScreenSlot, setRemoteScreenSlot] = useState<RemoteMediaSlot>(() =>
    createEmptyRemoteMediaSlot("screen")
  );
  const [remoteVideoReady, setRemoteVideoReady] = useState(false);
  const [remoteScreenReady, setRemoteScreenReady] = useState(false);
  const [remoteCameraUiStatus, setRemoteCameraUiStatus] =
    useState<RemoteMediaUiStatus>("inactive");
  const [remoteScreenUiStatus, setRemoteScreenUiStatus] =
    useState<RemoteMediaUiStatus>("inactive");

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteScreenVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoCompanionRef = useRef<HTMLVideoElement>(null);
  const remoteScreenCompanionRef = useRef<HTMLVideoElement>(null);
  const remoteCameraProbeRef = useRef<HTMLVideoElement>(null);
  const remoteScreenProbeRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioStreamRef = useRef<MediaStream | null>(null);
  const remoteCameraStreamRef = useRef<MediaStream | null>(null);
  const remoteScreenStreamRef = useRef<MediaStream | null>(null);
  const remoteCameraSlotRef = useRef<RemoteMediaSlot>(createEmptyRemoteMediaSlot("camera"));
  const remoteScreenSlotRef = useRef<RemoteMediaSlot>(createEmptyRemoteMediaSlot("screen"));
  const remoteReceiverSlotBindingsRef = useRef<Map<string, "camera" | "screen">>(new Map());
  const remoteReceiverTransceiverBindingsRef = useRef<WeakMap<RTCRtpTransceiver, "camera" | "screen">>(new WeakMap());
  const remoteTrackLifecycleCleanupRef = useRef<Map<string, () => void>>(new Map());
  const pendingReplacementTrackRef = useRef<Map<RemoteMediaSource, string>>(new Map());

  useEffect(() => {
    if (!activeCallId) {
      setRemoteVideoReady(false);
      setRemoteScreenReady(false);
      return;
    }

    const syncVideoReadiness = () => {
      const cameraStream = remoteCameraSlotRef.current.stream;
      const screenStream = remoteScreenSlotRef.current.stream;
      setRemoteVideoReady(
        isElementReadyForStream(remoteVideoRef.current, cameraStream) ||
        isElementReadyForStream(remoteCameraProbeRef.current, cameraStream)
      );
      setRemoteScreenReady(
        isElementReadyForStream(remoteScreenVideoRef.current, screenStream) ||
        isElementReadyForStream(remoteScreenProbeRef.current, screenStream)
      );
    };

    // Subscribe to media events on all probe/playback video elements so we
    // detect readiness as soon as the browser fires them, without polling.
    const elements = [
      remoteVideoRef.current,
      remoteCameraProbeRef.current,
      remoteScreenVideoRef.current,
      remoteScreenProbeRef.current,
    ].filter(Boolean) as HTMLVideoElement[];
    const unbindVideoReadinessListeners = bindVideoReadinessListeners(
      elements,
      syncVideoReadiness
    );

    // One-shot fallback poll after stream assignment completes in case the
    // browser already has HAVE_CURRENT_DATA before our listeners registered.
    syncVideoReadiness();
    const fallbackTimer = setTimeout(syncVideoReadiness, 400);

    return () => {
      clearTimeout(fallbackTimer);
      unbindVideoReadinessListeners();
    };
  }, [activeCallId, remoteCameraSlot.stream, remoteScreenSlot.stream]);

  const commitRemoteMediaSlot = useCallback((
    source: "camera" | "screen",
    nextSlot: RemoteMediaSlot
  ) => {
    const slotRef = source === "camera" ? remoteCameraSlotRef : remoteScreenSlotRef;
    const previousSlot = slotRef.current;

    if (
      previousSlot.trackId === nextSlot.trackId &&
      previousSlot.stream === nextSlot.stream &&
      previousSlot.status === nextSlot.status &&
      previousSlot.lastFrameAt === nextSlot.lastFrameAt &&
      previousSlot.lastPacketAt === nextSlot.lastPacketAt &&
      previousSlot.mid === nextSlot.mid &&
      previousSlot.signaledActivity === nextSlot.signaledActivity
    ) {
      return;
    }

    slotRef.current = nextSlot;
    const nextUiStatus = toRemoteMediaUiStatus(nextSlot.status);

    debugCallMedia("slot-commit", {
      source,
      trackId: nextSlot.trackId,
      status: nextSlot.status,
      mid: nextSlot.mid,
      signaledActivity: nextSlot.signaledActivity,
      hasStream: Boolean(nextSlot.stream),
      lastFrameAt: nextSlot.lastFrameAt,
      lastPacketAt: nextSlot.lastPacketAt,
    });

    if (source === "camera") {
      remoteCameraStreamRef.current = nextSlot.stream;
      setRemoteCameraSlot(nextSlot);
      setRemoteCameraUiStatus(nextUiStatus);
      return;
    }

    remoteScreenStreamRef.current = nextSlot.stream;
    setRemoteScreenSlot(nextSlot);
    setRemoteScreenUiStatus(nextUiStatus);
  }, [debugCallMedia]);

  const updateRemoteMediaSlot = useCallback((
    source: "camera" | "screen",
    updater: (slot: RemoteMediaSlot) => RemoteMediaSlot
  ) => {
    const slotRef = source === "camera" ? remoteCameraSlotRef : remoteScreenSlotRef;
    commitRemoteMediaSlot(source, updater(slotRef.current));
  }, [commitRemoteMediaSlot]);

  const resetRemoteMediaRuntime = useCallback(() => {
    for (const cleanup of remoteTrackLifecycleCleanupRef.current.values()) {
      cleanup();
    }
    remoteTrackLifecycleCleanupRef.current.clear();
    remoteReceiverSlotBindingsRef.current.clear();
    remoteReceiverTransceiverBindingsRef.current = new WeakMap();
    pendingReplacementTrackRef.current.clear();
    commitRemoteMediaSlot("camera", createEmptyRemoteMediaSlot("camera"));
    commitRemoteMediaSlot("screen", createEmptyRemoteMediaSlot("screen"));
  }, [commitRemoteMediaSlot]);

  return {
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
    remoteReceiverTransceiverBindingsRef,
    remoteTrackLifecycleCleanupRef,
    pendingReplacementTrackRef,
    commitRemoteMediaSlot,
    updateRemoteMediaSlot,
    resetRemoteMediaRuntime,
  };
}

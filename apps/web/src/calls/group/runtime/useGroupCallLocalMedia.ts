/**
 * useGroupCallLocalMedia — local media stream management for group calls.
 *
 * Owns:
 *   - Local camera and microphone stream state (localStream, localScreenStream)
 *   - Mute, video-on/off, and screen-share toggle handlers
 *   - Camera and microphone device switching (handleSwitchCamera, handleSwitchMic)
 *   - Video and screen resolution selection with live constraint application
 *   - Track lifecycle: acquiring via getUserMedia/getDisplayMedia, replacing on
 *     the SFU producer, and stopping on teardown
 *   - attachInitialStream / cleanupLocalMedia / resetLocalMediaState helpers
 *
 * Does not own remote media, participant roster, or SFU transport setup.
 * Video-switching and screen-switching flags are local to this hook; the SFU
 * client (sfuClientRef) is updated directly via setVideoTrack / setAudioTrack.
 */
import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { logGroupCallWarn } from "@/calls/group/runtime/media-key/logger";
import type { GroupSfuClient } from "@/calls/group/runtime/sfu";
import { resolveErrorMessage } from "@/calls/group/runtime/group-call-error-utils";
import type { GroupCallStatus } from "@/calls/group/model/group-call-types";
import type { VideoResolution } from "@/calls/shared/presentation/CallDevicePicker";

const VIDEO_RESOLUTION_CONSTRAINTS: Record<VideoResolution, { width: number; height: number }> = {
  "360p": { width: 640, height: 360 },
  "480p": { width: 854, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
};

interface UseGroupCallLocalMediaOptions {
  status: GroupCallStatus;
  sfuClientRef: MutableRefObject<GroupSfuClient | null>;
  setError: Dispatch<SetStateAction<string | null>>;
  mediaPermissionError: string;
  cameraToggleError: string;
  screenToggleError: string;
}

interface UseGroupCallLocalMediaResult {
  localStream: MediaStream | null;
  localScreenStream: MediaStream | null;
  isLocalAudioMuted: boolean;
  isVideoSwitching: boolean;
  isScreenSwitching: boolean;
  isLocalScreenSharing: boolean;
  selectedVideoResolution: VideoResolution;
  selectedScreenResolution: VideoResolution;
  localStreamRef: MutableRefObject<MediaStream | null>;
  localScreenStreamRef: MutableRefObject<MediaStream | null>;
  attachInitialStream: (stream: MediaStream) => void;
  resetLocalMediaState: () => void;
  cleanupLocalMedia: () => void;
  handleToggleMute: () => void;
  handleToggleVideo: () => Promise<void>;
  handleToggleScreenShare: () => Promise<void>;
  handleSwitchMic: (deviceId: string) => Promise<void>;
  handleSwitchCamera: (deviceId: string) => Promise<void>;
  handleSelectVideoResolution: (resolution: VideoResolution) => Promise<void>;
  handleSelectScreenResolution: (resolution: VideoResolution) => void;
}

export function useGroupCallLocalMedia({
  status,
  sfuClientRef,
  setError,
  mediaPermissionError,
  cameraToggleError,
  screenToggleError,
}: UseGroupCallLocalMediaOptions): UseGroupCallLocalMediaResult {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [isLocalAudioMuted, setIsLocalAudioMuted] = useState(false);
  const [isVideoSwitching, setIsVideoSwitching] = useState(false);
  const [isScreenSwitching, setIsScreenSwitching] = useState(false);
  const [isLocalScreenSharing, setIsLocalScreenSharing] = useState(false);
  const [selectedVideoResolution, setSelectedVideoResolution] = useState<VideoResolution>("720p");
  const [selectedScreenResolution, setSelectedScreenResolution] = useState<VideoResolution>("720p");
  const localStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);

  const syncLocalPreview = useCallback(() => {
    const currentStream = localStreamRef.current;
    if (!currentStream) {
      setLocalStream(null);
      return;
    }
    setLocalStream(new MediaStream(currentStream.getTracks()));
  }, []);

  const syncLocalScreenPreview = useCallback((track: MediaStreamTrack | null) => {
    if (!track) {
      localScreenStreamRef.current = null;
      setLocalScreenStream(null);
      setIsLocalScreenSharing(false);
      return;
    }

    const previewStream = new MediaStream([track]);
    localScreenStreamRef.current = previewStream;
    setLocalScreenStream(previewStream);
    setIsLocalScreenSharing(true);
  }, []);

  const resetLocalMediaState = useCallback(() => {
    setLocalStream(null);
    setLocalScreenStream(null);
    setIsLocalAudioMuted(false);
    setIsVideoSwitching(false);
    setIsScreenSwitching(false);
    setIsLocalScreenSharing(false);
  }, []);

  const cleanupLocalMedia = useCallback(() => {
    sfuClientRef.current?.close();
    sfuClientRef.current = null;

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }

    if (localScreenStreamRef.current) {
      for (const track of localScreenStreamRef.current.getTracks()) {
        track.stop();
      }
      localScreenStreamRef.current = null;
    }

    resetLocalMediaState();
  }, [resetLocalMediaState, sfuClientRef]);

  const attachInitialStream = useCallback((stream: MediaStream) => {
    localStreamRef.current = stream;
    setLocalStream(stream);
    setIsLocalAudioMuted(false);
  }, []);

  const removeCurrentScreenTrack = useCallback(async () => {
    const sfuClient = sfuClientRef.current;
    const currentScreenTrack = localScreenStreamRef.current?.getVideoTracks()[0] ?? null;
    if (!sfuClient && !currentScreenTrack) {
      return;
    }

    if (sfuClient) {
      await sfuClient.setVideoTrack(null, "screen");
    }
    if (currentScreenTrack) {
      currentScreenTrack.stop();
    }
    syncLocalScreenPreview(null);
  }, [sfuClientRef, syncLocalScreenPreview]);

  const handleToggleMute = useCallback(() => {
    const currentStream = localStreamRef.current;
    if (!currentStream || status !== "ready") return;
    const audioTracks = currentStream.getAudioTracks();
    if (audioTracks.length === 0) {
      setError(mediaPermissionError);
      return;
    }

    const nextMuted = !isLocalAudioMuted;
    for (const track of audioTracks) {
      track.enabled = !nextMuted;
    }
    setIsLocalAudioMuted(nextMuted);
  }, [isLocalAudioMuted, mediaPermissionError, setError, status]);

  const handleToggleVideo = useCallback(async () => {
    const currentStream = localStreamRef.current;
    const sfuClient = sfuClientRef.current;
    if (
      !currentStream ||
      !sfuClient ||
      isVideoSwitching ||
      isScreenSwitching ||
      status === "idle" ||
      status === "starting" ||
      status === "joining" ||
      status === "reconnecting" ||
      status === "leaving" ||
      status === "ending" ||
      status === "ended"
    ) {
      return;
    }
    setIsVideoSwitching(true);
    setError(null);

    const currentVideoTrack = currentStream.getVideoTracks()[0] ?? null;
    if (currentVideoTrack) {
      try {
        await sfuClient.setVideoTrack(null, "camera");
        currentStream.removeTrack(currentVideoTrack);
        currentVideoTrack.stop();
        syncLocalPreview();
      } catch (caughtError) {
        setError(resolveErrorMessage(caughtError, cameraToggleError));
      } finally {
        setIsVideoSwitching(false);
      }
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(cameraToggleError);
      setIsVideoSwitching(false);
      return;
    }

    let nextVideoTrack: MediaStreamTrack | null = null;
    try {
      const videoCapture = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      nextVideoTrack = videoCapture.getVideoTracks()[0] ?? null;
      if (!nextVideoTrack) {
        throw new Error(cameraToggleError);
      }

      await sfuClient.setVideoTrack(nextVideoTrack, "camera");
      currentStream.addTrack(nextVideoTrack);
      syncLocalPreview();
    } catch (caughtError) {
      nextVideoTrack?.stop();
      setError(resolveErrorMessage(caughtError, cameraToggleError));
    } finally {
      setIsVideoSwitching(false);
    }
  }, [
    cameraToggleError,
    isScreenSwitching,
    isVideoSwitching,
    setError,
    sfuClientRef,
    status,
    syncLocalPreview,
  ]);

  const handleToggleScreenShare = useCallback(async () => {
    const currentStream = localStreamRef.current;
    const sfuClient = sfuClientRef.current;
    if (
      !currentStream ||
      !sfuClient ||
      isScreenSwitching ||
      isVideoSwitching ||
      status === "starting" ||
      status === "leaving" ||
      status === "ending"
    ) {
      return;
    }

    setIsScreenSwitching(true);
    setError(null);

    const currentScreenTrack = localScreenStreamRef.current?.getVideoTracks()[0] ?? null;
    if (currentScreenTrack) {
      try {
        await removeCurrentScreenTrack();
      } catch (caughtError) {
        setError(resolveErrorMessage(caughtError, screenToggleError));
      } finally {
        setIsScreenSwitching(false);
      }
      return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError(screenToggleError);
      setIsScreenSwitching(false);
      return;
    }

    let nextScreenTrack: MediaStreamTrack | null = null;
    try {
      const displayCapture = await navigator.mediaDevices.getDisplayMedia({
        audio: false,
        video: {
          frameRate: { ideal: 15, max: 30 },
        },
      });
      nextScreenTrack = displayCapture.getVideoTracks()[0] ?? null;
      if (!nextScreenTrack) {
        throw new Error(screenToggleError);
      }

      await sfuClient.setVideoTrack(nextScreenTrack, "screen");
      syncLocalScreenPreview(nextScreenTrack);

      nextScreenTrack.addEventListener("ended", () => {
        const liveScreenTrack = localScreenStreamRef.current?.getVideoTracks()[0] ?? null;
        if (liveScreenTrack !== nextScreenTrack) return;
        removeCurrentScreenTrack().catch((caughtError) => {
          logGroupCallWarn("[group-call] failed to clear ended screen-share track", caughtError);
        });
      }, { once: true });
    } catch (caughtError) {
      nextScreenTrack?.stop();
      setError(resolveErrorMessage(caughtError, screenToggleError));
    } finally {
      setIsScreenSwitching(false);
    }
  }, [
    isScreenSwitching,
    isVideoSwitching,
    removeCurrentScreenTrack,
    screenToggleError,
    setError,
    sfuClientRef,
    status,
    syncLocalScreenPreview,
  ]);

  const handleSwitchMic = useCallback(async (deviceId: string) => {
    const currentStream = localStreamRef.current;
    const sfuClient = sfuClientRef.current;
    if (!currentStream || status !== "ready") return;

    let nextTrack: MediaStreamTrack | null = null;
    try {
      const capture = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
        video: false,
      });
      nextTrack = capture.getAudioTracks()[0] ?? null;
      if (!nextTrack) throw new Error("No audio track");

      const currentMuted = !currentStream.getAudioTracks()[0]?.enabled;
      nextTrack.enabled = !currentMuted;

      const oldTrack = currentStream.getAudioTracks()[0] ?? null;
      if (oldTrack) {
        currentStream.removeTrack(oldTrack);
        oldTrack.stop();
      }
      currentStream.addTrack(nextTrack);

      if (sfuClient) {
        await sfuClient.setAudioTrack(nextTrack);
      }
    } catch (caughtError) {
      nextTrack?.stop();
      setError(resolveErrorMessage(caughtError, mediaPermissionError));
    }
  }, [mediaPermissionError, setError, sfuClientRef, status]);

  const handleSwitchCamera = useCallback(async (deviceId: string) => {
    const currentStream = localStreamRef.current;
    const sfuClient = sfuClientRef.current;
    if (!currentStream || !sfuClient || isVideoSwitching || status !== "ready") return;

    setIsVideoSwitching(true);
    setError(null);
    let nextTrack: MediaStreamTrack | null = null;
    try {
      const constraints = VIDEO_RESOLUTION_CONSTRAINTS[selectedVideoResolution];
      const capture = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: constraints.width },
          height: { ideal: constraints.height },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      nextTrack = capture.getVideoTracks()[0] ?? null;
      if (!nextTrack) throw new Error("No video track");

      const oldTrack = currentStream.getVideoTracks()[0] ?? null;
      if (oldTrack) {
        currentStream.removeTrack(oldTrack);
        oldTrack.stop();
      }
      currentStream.addTrack(nextTrack);
      await sfuClient.setVideoTrack(nextTrack, "camera");
      syncLocalPreview();
    } catch (caughtError) {
      nextTrack?.stop();
      setError(resolveErrorMessage(caughtError, cameraToggleError));
    } finally {
      setIsVideoSwitching(false);
    }
  }, [cameraToggleError, isVideoSwitching, selectedVideoResolution, setError, sfuClientRef, status, syncLocalPreview]);

  const handleSelectVideoResolution = useCallback(async (resolution: VideoResolution) => {
    const currentStream = localStreamRef.current;
    if (!currentStream) return;

    const currentVideoTrack = currentStream.getVideoTracks()[0] ?? null;
    if (!currentVideoTrack) {
      setSelectedVideoResolution(resolution);
      return;
    }

    const constraints = VIDEO_RESOLUTION_CONSTRAINTS[resolution];
    try {
      await currentVideoTrack.applyConstraints({
        width: { ideal: constraints.width },
        height: { ideal: constraints.height },
        frameRate: { ideal: 30, max: 30 },
      });
      setSelectedVideoResolution(resolution);
    } catch (caughtError) {
      setError(resolveErrorMessage(caughtError, cameraToggleError));
    }
  }, [cameraToggleError, setError]);

  const handleSelectScreenResolution = useCallback((resolution: VideoResolution) => {
    const currentScreenTrack = localScreenStreamRef.current?.getVideoTracks()[0] ?? null;
    if (currentScreenTrack) {
      const constraints = VIDEO_RESOLUTION_CONSTRAINTS[resolution];
      currentScreenTrack.applyConstraints({
        width: { ideal: constraints.width },
        height: { ideal: constraints.height },
      }).catch((caughtError) => {
        logGroupCallWarn("[group-call] failed to apply screen resolution constraints", caughtError);
      });
    }
    setSelectedScreenResolution(resolution);
  }, []);

  return {
    localStream,
    localScreenStream,
    isLocalAudioMuted,
    isVideoSwitching,
    isScreenSwitching,
    isLocalScreenSharing,
    selectedVideoResolution,
    selectedScreenResolution,
    localStreamRef,
    localScreenStreamRef,
    attachInitialStream,
    resetLocalMediaState,
    cleanupLocalMedia,
    handleToggleMute,
    handleToggleVideo,
    handleToggleScreenShare,
    handleSwitchMic,
    handleSwitchCamera,
    handleSelectVideoResolution,
    handleSelectScreenResolution,
  };
}

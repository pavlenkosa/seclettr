import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { logGroupCallWarn } from "@/calls/group/runtime/group-call/logger";
import type { GroupSfuClient } from "@/calls/group/runtime/sfu";
import { resolveErrorMessage } from "@/calls/group/runtime/runtime-utils";
import type { GroupCallStatus } from "@/calls/group/model/group-call-types";

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
  localStreamRef: MutableRefObject<MediaStream | null>;
  localScreenStreamRef: MutableRefObject<MediaStream | null>;
  attachInitialStream: (stream: MediaStream) => void;
  resetLocalMediaState: () => void;
  cleanupLocalMedia: () => void;
  handleToggleMute: () => void;
  handleToggleVideo: () => Promise<void>;
  handleToggleScreenShare: () => Promise<void>;
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

  return {
    localStream,
    localScreenStream,
    isLocalAudioMuted,
    isVideoSwitching,
    isScreenSwitching,
    isLocalScreenSharing,
    localStreamRef,
    localScreenStreamRef,
    attachInitialStream,
    resetLocalMediaState,
    cleanupLocalMedia,
    handleToggleMute,
    handleToggleVideo,
    handleToggleScreenShare,
  };
}

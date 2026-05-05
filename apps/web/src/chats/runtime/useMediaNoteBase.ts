import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { logger } from "@/lib/logger.js";
import type { AttachmentMessageMeta } from "@/stores/messages";
import {
  createAttachmentObjectUrl,
  fetchAndDecryptAttachmentBlob,
  resolveChatAttachmentErrorCause,
  revokeAttachmentObjectUrl,
  type ChatAttachmentErrorCause,
  type ChatAttachmentMediaPlaybackOptions,
} from "./chat-attachment-runtime-shared";

export interface UseMediaNoteBaseOptions extends ChatAttachmentMediaPlaybackOptions {
  attachment?: AttachmentMessageMeta;
  messageId: string;
  autoDecrypt?: boolean;
  logPrefix: string;
  onBlobLoaded?: (blob: Blob) => void;
  onMediaEnded?: (el: HTMLMediaElement) => void;
}

export interface UseMediaNoteBaseResult<T extends HTMLMediaElement = HTMLMediaElement> {
  mediaRef: MutableRefObject<T | null>;
  mediaUrl: string | null;
  loading: boolean;
  errorCause: ChatAttachmentErrorCause | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  loadAndMaybePlay: (autoPlay?: boolean) => Promise<void>;
  togglePlayback: () => Promise<void>;
  handleScrub: (nextSeconds: number) => void;
}

export function useMediaNoteBase<T extends HTMLMediaElement = HTMLMediaElement>({
  attachment,
  messageId,
  mediaKey,
  activeMediaKey,
  onActiveMediaChange,
  autoDecrypt = false,
  logPrefix,
  onBlobLoaded,
  onMediaEnded,
}: UseMediaNoteBaseOptions): UseMediaNoteBaseResult<T> {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorCause, setErrorCause] = useState<ChatAttachmentErrorCause | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const mediaRef = useRef<T | null>(null);
  const shouldAutoplayRef = useRef(false);
  const autoDecryptFiredRef = useRef(false);
  const cleanupUrlRef = useRef<string | null>(null);

  useEffect(() => {
    cleanupUrlRef.current = mediaUrl;
  }, [mediaUrl]);

  useEffect(() => {
    const el = mediaRef.current;
    return () => {
      if (el) {
        el.pause();
        el.src = "";
      }
      revokeAttachmentObjectUrl(cleanupUrlRef.current);
    };
  }, []);

  const loadAndMaybePlay = useCallback(
    async (autoPlay = false) => {
      if (loading || mediaUrl || !attachment) return;

      setLoading(true);
      setErrorCause(null);

      try {
        const blob = await fetchAndDecryptAttachmentBlob(attachment, { messageId });
        const nextUrl = createAttachmentObjectUrl(blob);
        shouldAutoplayRef.current = autoPlay;
        onBlobLoaded?.(blob);
        setMediaUrl(nextUrl);
        setCurrentTime(0);
      } catch (error) {
        setErrorCause(resolveChatAttachmentErrorCause(error, "decryptFailed"));
        logger.error(`${logPrefix} decrypt failed`, messageId, error);
      } finally {
        setLoading(false);
      }
    },
    [attachment, loading, logPrefix, mediaUrl, messageId, onBlobLoaded]
  );

  useEffect(() => {
    if (!autoDecrypt || autoDecryptFiredRef.current || !attachment) return;
    autoDecryptFiredRef.current = true;
    void loadAndMaybePlay(false);
  }, [autoDecrypt, attachment, loadAndMaybePlay]);

  const togglePlayback = useCallback(async () => {
    if (!mediaUrl) {
      await loadAndMaybePlay(true);
      return;
    }

    const el = mediaRef.current;
    if (!el) return;

    if (el.paused) {
      try {
        setErrorCause(null);
        await el.play();
        setIsPlaying(true);
        onActiveMediaChange(mediaKey);
      } catch (error) {
        setErrorCause("playFailed");
        logger.error(`${logPrefix} play failed`, messageId, error);
      }
      return;
    }

    el.pause();
    setIsPlaying(false);
    if (activeMediaKey === mediaKey) {
      onActiveMediaChange(null);
    }
  }, [
    activeMediaKey,
    loadAndMaybePlay,
    logPrefix,
    mediaKey,
    mediaUrl,
    messageId,
    onActiveMediaChange,
  ]);

  const handleScrub = useCallback((nextSeconds: number) => {
    const el = mediaRef.current;
    if (!el) return;
    el.currentTime = nextSeconds;
    setCurrentTime(nextSeconds);
  }, []);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;

    const handlePlay = () => {
      setIsPlaying(true);
      onActiveMediaChange(mediaKey);
    };
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (activeMediaKey === mediaKey) {
        onActiveMediaChange(null);
      }
      onMediaEnded?.(el);
    };
    const handleTime = () => setCurrentTime(el.currentTime);
    const handleMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setDuration(el.duration);
      }
    };

    el.addEventListener("play", handlePlay);
    el.addEventListener("pause", handlePause);
    el.addEventListener("ended", handleEnded);
    el.addEventListener("timeupdate", handleTime);
    el.addEventListener("loadedmetadata", handleMeta);

    return () => {
      el.removeEventListener("play", handlePlay);
      el.removeEventListener("pause", handlePause);
      el.removeEventListener("ended", handleEnded);
      el.removeEventListener("timeupdate", handleTime);
      el.removeEventListener("loadedmetadata", handleMeta);
    };
  }, [activeMediaKey, mediaKey, mediaUrl, onActiveMediaChange, onMediaEnded]);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !mediaUrl) return;
    if (activeMediaKey !== mediaKey && !el.paused) {
      el.pause();
    }
  }, [activeMediaKey, mediaKey, mediaUrl]);

  useEffect(() => {
    if (!mediaUrl || !shouldAutoplayRef.current) return;
    const el = mediaRef.current;
    if (!el) return;

    shouldAutoplayRef.current = false;
    el
      .play()
      .then(() => onActiveMediaChange(mediaKey))
      .catch((error) => {
        setErrorCause("playFailed");
        logger.error(`${logPrefix} autoplay failed`, messageId, error);
      });
  }, [logPrefix, mediaKey, mediaUrl, messageId, onActiveMediaChange]);

  return {
    mediaRef,
    mediaUrl,
    loading,
    errorCause,
    isPlaying,
    currentTime,
    duration,
    loadAndMaybePlay,
    togglePlayback,
    handleScrub,
  };
}

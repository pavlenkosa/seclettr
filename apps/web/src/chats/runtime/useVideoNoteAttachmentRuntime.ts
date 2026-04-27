import { useCallback, type MutableRefObject } from "react";
import type { AttachmentMessageMeta } from "@/stores/messages";
import type { ChatAttachmentErrorCause, ChatAttachmentMediaPlaybackOptions } from "./chat-attachment-runtime-shared";
import { useMediaNoteBase } from "./useMediaNoteBase";

interface UseVideoNoteAttachmentRuntimeOptions extends ChatAttachmentMediaPlaybackOptions {
  attachment?: AttachmentMessageMeta;
  messageId: string;
  autoDecrypt?: boolean;
}

interface UseVideoNoteAttachmentRuntimeResult {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  videoUrl: string | null;
  loading: boolean;
  errorCause: ChatAttachmentErrorCause | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  loadAndMaybePlay: (autoPlay?: boolean) => Promise<void>;
  togglePlayback: () => Promise<void>;
}

export function useVideoNoteAttachmentRuntime({
  attachment,
  messageId,
  mediaKey,
  activeMediaKey,
  onActiveMediaChange,
  autoDecrypt = false,
}: UseVideoNoteAttachmentRuntimeOptions): UseVideoNoteAttachmentRuntimeResult {
  const onMediaEnded = useCallback((el: HTMLMediaElement) => {
    el.currentTime = 0;
  }, []);

  const {
    mediaRef: videoRef,
    mediaUrl: videoUrl,
    loading,
    errorCause,
    isPlaying,
    currentTime,
    duration,
    loadAndMaybePlay,
    togglePlayback,
  } = useMediaNoteBase<HTMLVideoElement>({
    attachment,
    messageId,
    mediaKey,
    activeMediaKey,
    onActiveMediaChange,
    autoDecrypt,
    logPrefix: "[MSG] video note",
    onMediaEnded,
  });

  return {
    videoRef,
    videoUrl,
    loading,
    errorCause,
    isPlaying,
    currentTime,
    duration,
    loadAndMaybePlay,
    togglePlayback,
  };
}

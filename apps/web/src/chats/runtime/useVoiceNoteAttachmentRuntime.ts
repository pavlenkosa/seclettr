import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  createFallbackWaveform,
  decodeAudioWaveform,
  PLAYBACK_WAVEFORM_BAR_COUNT,
} from "@/chats/presentation/shared/audio-waveform";
import type { AttachmentMessageMeta } from "@/stores/messages";
import type { ChatAttachmentErrorCause, ChatAttachmentMediaPlaybackOptions } from "./chat-attachment-runtime-shared";
import { useMediaNoteBase } from "./useMediaNoteBase";

export type VoiceNotePlaybackRate = 1 | 1.5 | 2;

interface UseVoiceNoteAttachmentRuntimeOptions extends ChatAttachmentMediaPlaybackOptions {
  attachment?: AttachmentMessageMeta;
  messageId: string;
  autoDecrypt?: boolean;
}

interface UseVoiceNoteAttachmentRuntimeResult {
  audioRef: MutableRefObject<HTMLAudioElement | null>;
  audioUrl: string | null;
  loading: boolean;
  errorCause: ChatAttachmentErrorCause | null;
  isPlaying: boolean;
  currentTime: number;
  decodedDuration: number;
  playbackRate: VoiceNotePlaybackRate;
  setPlaybackRate: Dispatch<SetStateAction<VoiceNotePlaybackRate>>;
  waveformBars: number[];
  loadAndMaybePlay: (autoPlay?: boolean) => Promise<void>;
  togglePlayback: () => Promise<void>;
  handleScrub: (nextSeconds: number) => void;
}

export function useVoiceNoteAttachmentRuntime({
  attachment,
  messageId,
  mediaKey,
  activeMediaKey,
  onActiveMediaChange,
  autoDecrypt = false,
}: UseVoiceNoteAttachmentRuntimeOptions): UseVoiceNoteAttachmentRuntimeResult {
  const [playbackRate, setPlaybackRate] = useState<VoiceNotePlaybackRate>(1);
  const [waveformBars, setWaveformBars] = useState<number[]>(
    () => createFallbackWaveform(PLAYBACK_WAVEFORM_BAR_COUNT)
  );
  const waveformRequestIdRef = useRef(0);

  const onBlobLoaded = useCallback((blob: Blob) => {
    const requestId = ++waveformRequestIdRef.current;
    decodeAudioWaveform(blob, PLAYBACK_WAVEFORM_BAR_COUNT)
      .then((bars) => {
        if (waveformRequestIdRef.current !== requestId) return;
        setWaveformBars(bars);
      })
      .catch(() => {});
  }, []);

  const {
    mediaRef: audioRef,
    mediaUrl: audioUrl,
    duration: decodedDuration,
    handleScrub,
    loading,
    errorCause,
    isPlaying,
    currentTime,
    loadAndMaybePlay,
    togglePlayback,
  } = useMediaNoteBase<HTMLAudioElement>({
    attachment,
    messageId,
    mediaKey,
    activeMediaKey,
    onActiveMediaChange,
    autoDecrypt,
    logPrefix: "[MSG] voice note",
    onBlobLoaded,
  });

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [audioRef, audioUrl, playbackRate]);

  return {
    audioRef,
    audioUrl,
    loading,
    errorCause,
    isPlaying,
    currentTime,
    decodedDuration,
    playbackRate,
    setPlaybackRate,
    waveformBars,
    loadAndMaybePlay,
    togglePlayback,
    handleScrub,
  };
}

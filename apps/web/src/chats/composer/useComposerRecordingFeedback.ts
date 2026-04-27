import { useCallback, useEffect } from "react";
import {
  createRecordingWaveformSeed,
  pushLiveWaveformLevel,
  readLiveWaveformLevel,
  RECORDING_WAVEFORM_BAR_COUNT,
} from "../presentation/shared/audio-waveform";
import type { RecordMode } from "./MessageComposerPrimaryActions";
import type {
  ComposerRecordingRuntimeRefs,
  ComposerRecordingStateSetters,
} from "./composer-recording-runtime-shared";

interface UseComposerRecordingFeedbackOptions {
  sending: boolean;
  recordingKind: RecordMode | null;
  refs: ComposerRecordingRuntimeRefs;
  setters: ComposerRecordingStateSetters;
}

interface UseComposerRecordingFeedbackResult {
  cleanupRecordingFeedback: () => void;
  handleRecordModeToggle: () => void;
  startVoiceWaveform: (stream: MediaStream) => void;
}

export function useComposerRecordingFeedback({
  sending,
  recordingKind,
  refs,
  setters,
}: UseComposerRecordingFeedbackOptions): UseComposerRecordingFeedbackResult {
  const stopRecordingWaveform = useCallback(() => {
    if (refs.recordingWaveformFrameRef.current !== null) {
      cancelAnimationFrame(refs.recordingWaveformFrameRef.current);
      refs.recordingWaveformFrameRef.current = null;
    }
    refs.recordingAnalyserSourceRef.current?.disconnect();
    refs.recordingAnalyserSourceRef.current = null;
    refs.recordingAnalyserRef.current = null;
    refs.recordingAnalyserBufferRef.current = null;
    refs.recordingWaveformSampleAtRef.current = 0;

    if (refs.recordingAnalyserContextRef.current) {
      refs.recordingAnalyserContextRef.current.close().catch(() => {});
      refs.recordingAnalyserContextRef.current = null;
    }
  }, [refs]);

  const clearRecordHintTimer = useCallback(() => {
    if (refs.recordHintTimerRef.current !== null) {
      clearTimeout(refs.recordHintTimerRef.current);
      refs.recordHintTimerRef.current = null;
    }
  }, [refs]);

  const showRecordHint = useCallback((durationMs = 1800) => {
    clearRecordHintTimer();
    setters.setIsRecordHintVisible(true);
    refs.recordHintTimerRef.current = globalThis.setTimeout(() => {
      refs.recordHintTimerRef.current = null;
      setters.setIsRecordHintVisible(false);
    }, durationMs) as unknown as number;
  }, [clearRecordHintTimer, refs, setters]);

  const syncVideoPreview = useCallback((stream: MediaStream | null) => {
    const video = refs.previewVideoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) {
      video.play().catch(() => {});
      return;
    }
    video.removeAttribute("src");
    video.load();
  }, [refs.previewVideoRef]);

  const stopRecordingTimer = useCallback(() => {
    if (refs.recordingTimerRef.current !== null) {
      clearInterval(refs.recordingTimerRef.current);
      refs.recordingTimerRef.current = null;
    }
  }, [refs]);

  const cleanupRecordingFeedback = useCallback(() => {
    clearRecordHintTimer();
    stopRecordingTimer();
    stopRecordingWaveform();
    setters.setRecordingSeconds(0);
    setters.setRecordingWaveformBars(
      createRecordingWaveformSeed(RECORDING_WAVEFORM_BAR_COUNT)
    );
    setters.setIsRecordHintVisible(false);
    syncVideoPreview(null);
  }, [
    clearRecordHintTimer,
    setters,
    stopRecordingTimer,
    stopRecordingWaveform,
    syncVideoPreview,
  ]);

  const startVoiceWaveform = useCallback((stream: MediaStream) => {
    stopRecordingWaveform();
    setters.setRecordingWaveformBars(
      createRecordingWaveformSeed(RECORDING_WAVEFORM_BAR_COUNT)
    );

    const AudioContextCtor = globalThis.AudioContext
      ?? (globalThis as unknown as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    try {
      const audioContext = new AudioContextCtor();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);

      refs.recordingAnalyserContextRef.current = audioContext;
      refs.recordingAnalyserRef.current = analyser;
      refs.recordingAnalyserSourceRef.current = source;
      refs.recordingAnalyserBufferRef.current = new Uint8Array(analyser.fftSize);
      audioContext.resume().catch(() => {});

      const tick = (time: number) => {
        const activeAnalyser = refs.recordingAnalyserRef.current;
        const activeBuffer = refs.recordingAnalyserBufferRef.current;
        if (!activeAnalyser || !activeBuffer) return;
        if (time - refs.recordingWaveformSampleAtRef.current >= 72) {
          refs.recordingWaveformSampleAtRef.current = time;
          const level = readLiveWaveformLevel(activeAnalyser, activeBuffer);
          setters.setRecordingWaveformBars((current) =>
            pushLiveWaveformLevel(current, level, RECORDING_WAVEFORM_BAR_COUNT)
          );
        }
        refs.recordingWaveformFrameRef.current = requestAnimationFrame(tick);
      };

      refs.recordingWaveformFrameRef.current = requestAnimationFrame(tick);
    } catch {
      setters.setRecordingWaveformBars(
        createRecordingWaveformSeed(RECORDING_WAVEFORM_BAR_COUNT)
      );
    }
  }, [refs, setters, stopRecordingWaveform]);

  const handleRecordModeToggle = useCallback(() => {
    if (sending || recordingKind !== null) return;
    setters.setPreferredRecordMode((current) => (current === "voice" ? "video" : "voice"));
    showRecordHint();
  }, [recordingKind, sending, setters, showRecordHint]);

  useEffect(() => {
    if (recordingKind !== null) return;
    if (sending) return;
    if (refs.didShowInitialRecordHintRef.current) return;
    refs.didShowInitialRecordHintRef.current = true;
    showRecordHint(2400);
  }, [recordingKind, refs, sending, showRecordHint]);

  useEffect(() => {
    if (recordingKind === null) return;
    stopRecordingTimer();
    setters.setRecordingSeconds(0);
    refs.recordingTimerRef.current = globalThis.setInterval(() => {
      setters.setRecordingSeconds(
        Math.floor((Date.now() - refs.recordingStartedAtRef.current) / 1000)
      );
    }, 500) as unknown as number;

    setters.setIsRecordHintVisible(false);
    return () => {
      stopRecordingTimer();
    };
  }, [recordingKind, refs, setters, stopRecordingTimer]);

  useEffect(() => {
    if (recordingKind === "video" && refs.mediaStreamRef.current) {
      syncVideoPreview(refs.mediaStreamRef.current);
      return;
    }
    if (recordingKind !== "video") {
      syncVideoPreview(null);
    }
  }, [recordingKind, refs, syncVideoPreview]);

  return {
    cleanupRecordingFeedback,
    handleRecordModeToggle,
    startVoiceWaveform,
  };
}

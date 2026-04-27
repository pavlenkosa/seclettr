import { useMemo, useRef, useState } from "react";
import {
  createRecordingWaveformSeed,
} from "../presentation/shared/audio-waveform";
import { useComposerRecorderLifecycle } from "./useComposerRecorderLifecycle";
import { useComposerRecordingFeedback } from "./useComposerRecordingFeedback";
import type {
  ComposerRecordingRuntimeRefs,
  UseComposerRecordingOptions,
  UseComposerRecordingResult,
} from "./composer-recording-runtime-shared";
import type { RecordMode } from "./MessageComposerPrimaryActions";

export type {
  UseComposerRecordingOptions,
  UseComposerRecordingResult,
} from "./composer-recording-runtime-shared";

export function useComposerRecording({
  sending,
  onSendVoiceBlob,
  onSendVideoBlob,
  onRecordingError,
}: UseComposerRecordingOptions): UseComposerRecordingResult {
  const [preferredRecordMode, setPreferredRecordMode] = useState<RecordMode>("voice");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingWaveformBars, setRecordingWaveformBars] = useState<number[]>(
    () => createRecordingWaveformSeed()
  );
  const [isRecordHintVisible, setIsRecordHintVisible] = useState(false);
  const [recordingKindState, setRecordingKindState] = useState<RecordMode | null>(null);

  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingStartedAtRef = useRef(0);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingWaveformFrameRef = useRef<number | null>(null);
  const recordingWaveformSampleAtRef = useRef(0);
  const recordingAnalyserRef = useRef<AnalyserNode | null>(null);
  const recordingAnalyserContextRef = useRef<AudioContext | null>(null);
  const recordingAnalyserSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recordingAnalyserBufferRef = useRef<Uint8Array | null>(null);
  const discardRecordingOnStopRef = useRef(false);
  const recordHintTimerRef = useRef<number | null>(null);
  const didShowInitialRecordHintRef = useRef(false);

  const refs: ComposerRecordingRuntimeRefs = useMemo(() => ({
    previewVideoRef,
    mediaRecorderRef,
    mediaStreamRef,
    recordingStartedAtRef,
    chunksRef,
    recordingTimerRef,
    recordingWaveformFrameRef,
    recordingWaveformSampleAtRef,
    recordingAnalyserRef,
    recordingAnalyserContextRef,
    recordingAnalyserSourceRef,
    recordingAnalyserBufferRef,
    discardRecordingOnStopRef,
    recordHintTimerRef,
    didShowInitialRecordHintRef,
  }), []);

  const setters = useMemo(() => ({
    setRecordingKind: setRecordingKindState,
    setPreferredRecordMode,
    setRecordingSeconds,
    setRecordingWaveformBars,
    setIsRecordHintVisible,
  }), []);

  const feedback = useComposerRecordingFeedback({
    sending,
    recordingKind: recordingKindState,
    refs,
    setters,
  });

  const lifecycle = useComposerRecorderLifecycle({
    sending,
    onSendVoiceBlob,
    onSendVideoBlob,
    onRecordingError,
    recordingKind: recordingKindState,
    refs,
    setters,
    startVoiceWaveform: feedback.startVoiceWaveform,
    cleanupRecordingFeedback: feedback.cleanupRecordingFeedback,
  });

  return {
    cleanupRecording: lifecycle.cleanupRecording,
    handleRecordModeToggle: feedback.handleRecordModeToggle,
    isRecordHintVisible,
    preferredRecordMode,
    previewVideoRef: refs.previewVideoRef,
    recordingKind: recordingKindState,
    recordingSeconds,
    recordingWaveformBars,
    startRecording: lifecycle.startRecording,
    stopCurrentRecording: lifecycle.stopCurrentRecording,
  };
}

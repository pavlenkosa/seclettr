import type {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react";
import type { RecordMode } from "./MessageComposerPrimaryActions";

export interface UseComposerRecordingOptions {
  sending: boolean;
  onSendVoiceBlob: (blob: Blob, durationMs: number) => Promise<void>;
  onSendVideoBlob: (blob: Blob, durationMs: number) => Promise<void>;
  onRecordingError: (error: unknown, kind: RecordMode) => void;
}

export interface UseComposerRecordingResult {
  recordingKind: RecordMode | null;
  preferredRecordMode: RecordMode;
  recordingSeconds: number;
  recordingWaveformBars: number[];
  isRecordHintVisible: boolean;
  previewVideoRef: RefObject<HTMLVideoElement>;
  startRecording: (kind: RecordMode) => Promise<void>;
  stopCurrentRecording: (options?: ComposerRecordingStopOptions) => void;
  cleanupRecording: () => void;
  handleRecordModeToggle: () => void;
}

export interface ComposerRecordingStopOptions {
  discard?: boolean;
}

export interface ComposerRecordingRuntimeRefs {
  previewVideoRef: RefObject<HTMLVideoElement>;
  mediaRecorderRef: MutableRefObject<MediaRecorder | null>;
  mediaStreamRef: MutableRefObject<MediaStream | null>;
  recordingStartedAtRef: MutableRefObject<number>;
  chunksRef: MutableRefObject<BlobPart[]>;
  recordingTimerRef: MutableRefObject<number | null>;
  recordingWaveformFrameRef: MutableRefObject<number | null>;
  recordingWaveformSampleAtRef: MutableRefObject<number>;
  recordingAnalyserRef: MutableRefObject<AnalyserNode | null>;
  recordingAnalyserContextRef: MutableRefObject<AudioContext | null>;
  recordingAnalyserSourceRef: MutableRefObject<MediaStreamAudioSourceNode | null>;
  recordingAnalyserBufferRef: MutableRefObject<Uint8Array | null>;
  discardRecordingOnStopRef: MutableRefObject<boolean>;
  recordHintTimerRef: MutableRefObject<number | null>;
  didShowInitialRecordHintRef: MutableRefObject<boolean>;
}

export interface ComposerRecordingStateSetters {
  setRecordingKind: Dispatch<SetStateAction<RecordMode | null>>;
  setPreferredRecordMode: Dispatch<SetStateAction<RecordMode>>;
  setRecordingSeconds: Dispatch<SetStateAction<number>>;
  setRecordingWaveformBars: Dispatch<SetStateAction<number[]>>;
  setIsRecordHintVisible: Dispatch<SetStateAction<boolean>>;
}

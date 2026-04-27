import { useCallback } from "react";
import type { RecordMode } from "./MessageComposerPrimaryActions";
import type {
  ComposerRecordingRuntimeRefs,
  ComposerRecordingStateSetters,
  ComposerRecordingStopOptions,
  UseComposerRecordingOptions,
} from "./composer-recording-runtime-shared";
import { logger } from "@/lib/logger.js";

interface UseComposerRecorderLifecycleOptions extends UseComposerRecordingOptions {
  recordingKind: RecordMode | null;
  refs: ComposerRecordingRuntimeRefs;
  setters: ComposerRecordingStateSetters;
  startVoiceWaveform: (stream: MediaStream) => void;
  cleanupRecordingFeedback: () => void;
}

interface UseComposerRecorderLifecycleResult {
  startRecording: (kind: RecordMode) => Promise<void>;
  stopCurrentRecording: (options?: ComposerRecordingStopOptions) => void;
  cleanupRecording: () => void;
}

function stopMediaCapture(
  refs: ComposerRecordingRuntimeRefs
) {
  refs.mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  refs.mediaStreamRef.current = null;
}

function resolveAudioMimeType(): string | undefined {
  return [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/aac",
  ].find((mime) => MediaRecorder.isTypeSupported(mime));
}

function resolveVideoMimeType(): string | undefined {
  return [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ].find((mime) => MediaRecorder.isTypeSupported(mime));
}

async function requestVideoCaptureStream(): Promise<MediaStream> {
  const videoConstraints: MediaStreamConstraints[] = [
    { video: { facingMode: "user" }, audio: true },
    { video: { facingMode: "environment" }, audio: true },
    { video: true, audio: true },
    { video: { facingMode: "user" }, audio: false },
    { video: true, audio: false },
  ];

  let captureError: unknown;
  let resolvedStream: MediaStream | null = null;

  for (const constraints of videoConstraints) {
    try {
      resolvedStream = await navigator.mediaDevices.getUserMedia(constraints);
      break;
    } catch (error) {
      captureError = error;
    }
  }

  if (!resolvedStream) {
    throw captureError ?? new Error("VIDEO_CAPTURE_UNAVAILABLE");
  }

  return resolvedStream;
}

export function useComposerRecorderLifecycle({
  sending,
  onSendVoiceBlob,
  onSendVideoBlob,
  onRecordingError,
  recordingKind,
  refs,
  setters,
  startVoiceWaveform,
  cleanupRecordingFeedback,
}: UseComposerRecorderLifecycleOptions): UseComposerRecorderLifecycleResult {
  const cleanupRecorderState = useCallback(() => {
    cleanupRecordingFeedback();
    setters.setRecordingKind(null);
    refs.chunksRef.current = [];
    refs.mediaRecorderRef.current = null;
    stopMediaCapture(refs);
  }, [cleanupRecordingFeedback, refs, setters]);

  const stopCurrentRecording = useCallback((options?: ComposerRecordingStopOptions) => {
    const recorder = refs.mediaRecorderRef.current;
    refs.discardRecordingOnStopRef.current = !!(options?.discard);
    if (!recorder) return;
    if (recorder.state !== "inactive") {
      recorder.stop();
      return;
    }
    cleanupRecorderState();
  }, [cleanupRecorderState, refs]);

  const startRecording = useCallback(async (kind: RecordMode) => {
    if (sending || recordingKind !== null) return;
    if (!("MediaRecorder" in globalThis) || !navigator.mediaDevices?.getUserMedia) {
      onRecordingError(new Error("UNAVAILABLE"), kind);
      return;
    }

    try {
      refs.discardRecordingOnStopRef.current = false;
      const stream = kind === "voice"
        ? await navigator.mediaDevices.getUserMedia({ audio: true })
        : await requestVideoCaptureStream();
      const selectedMimeType = kind === "voice"
        ? resolveAudioMimeType()
        : resolveVideoMimeType();

      refs.mediaStreamRef.current = stream;
      if (kind === "voice") {
        startVoiceWaveform(stream);
      }

      const recorder = selectedMimeType
        ? new MediaRecorder(stream, { mimeType: selectedMimeType })
        : new MediaRecorder(stream);

      refs.chunksRef.current = [];
      refs.recordingStartedAtRef.current = Date.now();
      setters.setRecordingSeconds(0);
      setters.setRecordingKind(kind);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          refs.chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const recordedDurationMs = Math.max(
          1_000,
          Date.now() - refs.recordingStartedAtRef.current
        );
        const mimeType = recorder.mimeType
          || selectedMimeType
          || (kind === "voice" ? "audio/webm" : "video/webm");
        const mediaBlob = new Blob(refs.chunksRef.current, { type: mimeType });
        const shouldDiscard = refs.discardRecordingOnStopRef.current;
        refs.discardRecordingOnStopRef.current = false;

        cleanupRecorderState();
        if (shouldDiscard) return;

        if (mediaBlob.size <= 0) {
          onRecordingError(new Error("EMPTY_BLOB"), kind);
          return;
        }

        if (kind === "voice") {
          onSendVoiceBlob(mediaBlob, recordedDurationMs);
          return;
        }
        onSendVideoBlob(mediaBlob, recordedDurationMs);
      };

      recorder.onerror = (event) => {
        logger.error("Recorder error:", event);
        onRecordingError(new Error("RECORDER_ERROR"), kind);
      };

      refs.mediaRecorderRef.current = recorder;
      recorder.start();
    } catch (error) {
      cleanupRecorderState();
      logger.error(`${kind} recording failed:`, error);
      onRecordingError(error, kind);
    }
  }, [
    cleanupRecorderState,
    onRecordingError,
    onSendVideoBlob,
    onSendVoiceBlob,
    recordingKind,
    refs,
    sending,
    setters,
    startVoiceWaveform,
  ]);

  const cleanupRecording = useCallback(() => {
    cleanupRecordingFeedback();
    if (refs.mediaRecorderRef.current && refs.mediaRecorderRef.current.state !== "inactive") {
      refs.discardRecordingOnStopRef.current = true;
      refs.mediaRecorderRef.current.stop();
    }
    stopMediaCapture(refs);
  }, [cleanupRecordingFeedback, refs]);

  return {
    cleanupRecording,
    startRecording,
    stopCurrentRecording,
  };
}

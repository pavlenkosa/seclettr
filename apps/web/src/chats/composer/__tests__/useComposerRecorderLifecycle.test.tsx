// @vitest-environment jsdom

import {
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ComposerRecordingRuntimeRefs,
  ComposerRecordingStateSetters,
} from "../composer-recording-runtime-shared";
import { useComposerRecorderLifecycle } from "../useComposerRecorderLifecycle";

class MockMediaRecorder {
  static instances: MockMediaRecorder[] = [];
  static isTypeSupported = vi.fn(() => true);

  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  stop = vi.fn(() => {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["recording"], { type: this.mimeType }),
    } as BlobEvent);
    this.onstop?.(new Event("stop"));
  });

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? "audio/webm";
    MockMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }
}

interface LifecycleHookValue {
  recordingKind: "voice" | "video" | null;
  startRecording: (kind: "voice" | "video") => Promise<void>;
  stopCurrentRecording: (options?: { discard?: boolean }) => void;
  cleanupRecording: () => void;
  refs: ComposerRecordingRuntimeRefs;
}

interface HarnessProps {
  readonly hookRef: MutableRefObject<LifecycleHookValue | null>;
  readonly sending?: boolean;
  readonly onSendVoiceBlob: (blob: Blob, durationMs: number) => Promise<void>;
  readonly onSendVideoBlob: (blob: Blob, durationMs: number) => Promise<void>;
  readonly onRecordingError: (error: unknown, kind: "voice" | "video") => void;
  readonly cleanupRecordingFeedback: () => void;
  readonly startVoiceWaveform: (stream: MediaStream) => void;
}

function LifecycleHarness({
  hookRef,
  sending = false,
  onSendVoiceBlob,
  onSendVideoBlob,
  onRecordingError,
  cleanupRecordingFeedback,
  startVoiceWaveform,
}: HarnessProps) {
  const [recordingKind, setRecordingKind] = useState<"voice" | "video" | null>(null);
  const [, setPreferredRecordMode] = useState<"voice" | "video">("voice");
  const [, setRecordingSeconds] = useState(0);
  const [, setRecordingWaveformBars] = useState<number[]>([]);
  const [, setIsRecordHintVisible] = useState(false);

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

  const setters: ComposerRecordingStateSetters = {
    setRecordingKind,
    setPreferredRecordMode,
    setRecordingSeconds,
    setRecordingWaveformBars,
    setIsRecordHintVisible,
  };

  const hook = useComposerRecorderLifecycle({
    sending,
    onSendVoiceBlob,
    onSendVideoBlob,
    onRecordingError,
    recordingKind,
    refs,
    setters,
    startVoiceWaveform,
    cleanupRecordingFeedback,
  });

  hookRef.current = {
    ...hook,
    recordingKind,
    refs,
  };

  return <video ref={previewVideoRef} />;
}

function createMediaStreamStub(stopTrack = vi.fn()): MediaStream {
  return {
    getTracks: () => [{ stop: stopTrack }],
  } as unknown as MediaStream;
}

describe("useComposerRecorderLifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookRef: MutableRefObject<LifecycleHookValue | null>;
  let onSendVoiceBlob: ReturnType<
    typeof vi.fn<[Blob, number], Promise<void>>
  >;
  let onSendVideoBlob: ReturnType<
    typeof vi.fn<[Blob, number], Promise<void>>
  >;
  let onRecordingError: ReturnType<
    typeof vi.fn<[unknown, "voice" | "video"], void>
  >;
  let cleanupRecordingFeedback: ReturnType<typeof vi.fn<[], void>>;
  let startVoiceWaveform: ReturnType<typeof vi.fn<[MediaStream], void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-30T09:00:00.000Z"));
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    MockMediaRecorder.instances = [];
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    hookRef = { current: null };
    onSendVoiceBlob = vi.fn<[Blob, number], Promise<void>>().mockResolvedValue(undefined);
    onSendVideoBlob = vi.fn<[Blob, number], Promise<void>>().mockResolvedValue(undefined);
    onRecordingError = vi.fn<[unknown, "voice" | "video"], void>();
    cleanupRecordingFeedback = vi.fn<[], void>();
    startVoiceWaveform = vi.fn<[MediaStream], void>();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("sends a voice blob with measured duration", async () => {
    const stopTrack = vi.fn();
    const getUserMedia = vi.fn(async () => createMediaStreamStub(stopTrack));
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    act(() => {
      root.render(
        <LifecycleHarness
          hookRef={hookRef}
          onSendVoiceBlob={onSendVoiceBlob}
          onSendVideoBlob={onSendVideoBlob}
          onRecordingError={onRecordingError}
          cleanupRecordingFeedback={cleanupRecordingFeedback}
          startVoiceWaveform={startVoiceWaveform}
        />
      );
    });

    await act(async () => {
      await hookRef.current?.startRecording("voice");
    });

    act(() => {
      vi.setSystemTime(new Date("2026-03-30T09:00:01.500Z"));
    });

    await act(async () => {
      hookRef.current?.stopCurrentRecording();
      await Promise.resolve();
    });

    expect(startVoiceWaveform).toHaveBeenCalledTimes(1);
    expect(onSendVoiceBlob).toHaveBeenCalledTimes(1);
    expect(onSendVoiceBlob.mock.calls[0]?.[1]).toBe(1500);
    expect(stopTrack).toHaveBeenCalled();
  });

  it("tries the video capture fallback chain until one constraint succeeds", async () => {
    const getUserMedia = vi.fn()
      .mockRejectedValueOnce(new Error("front failed"))
      .mockRejectedValueOnce(new Error("rear failed"))
      .mockResolvedValueOnce(createMediaStreamStub());
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    act(() => {
      root.render(
        <LifecycleHarness
          hookRef={hookRef}
          onSendVoiceBlob={onSendVoiceBlob}
          onSendVideoBlob={onSendVideoBlob}
          onRecordingError={onRecordingError}
          cleanupRecordingFeedback={cleanupRecordingFeedback}
          startVoiceWaveform={startVoiceWaveform}
        />
      );
    });

    await act(async () => {
      await hookRef.current?.startRecording("video");
    });

    expect(getUserMedia).toHaveBeenCalledTimes(3);
    expect(getUserMedia.mock.calls[0]?.[0]).toEqual({ video: { facingMode: "user" }, audio: true });
    expect(getUserMedia.mock.calls[1]?.[0]).toEqual({ video: { facingMode: "environment" }, audio: true });
    expect(getUserMedia.mock.calls[2]?.[0]).toEqual({ video: true, audio: true });
  });

  it("does not send blobs when the recording is discarded", async () => {
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => createMediaStreamStub()) },
    });

    act(() => {
      root.render(
        <LifecycleHarness
          hookRef={hookRef}
          onSendVoiceBlob={onSendVoiceBlob}
          onSendVideoBlob={onSendVideoBlob}
          onRecordingError={onRecordingError}
          cleanupRecordingFeedback={cleanupRecordingFeedback}
          startVoiceWaveform={startVoiceWaveform}
        />
      );
    });

    await act(async () => {
      await hookRef.current?.startRecording("voice");
    });

    await act(async () => {
      hookRef.current?.stopCurrentRecording({ discard: true });
      await Promise.resolve();
    });

    expect(onSendVoiceBlob).not.toHaveBeenCalled();
  });

  it("maps recorder errors through onRecordingError", async () => {
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => createMediaStreamStub()) },
    });

    act(() => {
      root.render(
        <LifecycleHarness
          hookRef={hookRef}
          onSendVoiceBlob={onSendVoiceBlob}
          onSendVideoBlob={onSendVideoBlob}
          onRecordingError={onRecordingError}
          cleanupRecordingFeedback={cleanupRecordingFeedback}
          startVoiceWaveform={startVoiceWaveform}
        />
      );
    });

    await act(async () => {
      await hookRef.current?.startRecording("voice");
    });

    act(() => {
      MockMediaRecorder.instances[0]?.onerror?.(new Event("error"));
    });

    expect(onRecordingError).toHaveBeenCalled();
    expect((onRecordingError.mock.calls[0]?.[0] as Error)?.message).toBe("RECORDER_ERROR");
    expect(onRecordingError.mock.calls[0]?.[1]).toBe("voice");
  });

  it("cleanup stops active tracks and stops an active recorder", async () => {
    const stopTrack = vi.fn();
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => createMediaStreamStub(stopTrack)) },
    });

    act(() => {
      root.render(
        <LifecycleHarness
          hookRef={hookRef}
          onSendVoiceBlob={onSendVoiceBlob}
          onSendVideoBlob={onSendVideoBlob}
          onRecordingError={onRecordingError}
          cleanupRecordingFeedback={cleanupRecordingFeedback}
          startVoiceWaveform={startVoiceWaveform}
        />
      );
    });

    await act(async () => {
      await hookRef.current?.startRecording("voice");
    });

    const recorder = MockMediaRecorder.instances[0];
    expect(recorder).toBeDefined();

    act(() => {
      hookRef.current?.cleanupRecording();
    });

    expect(recorder?.stop).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalled();
    expect(hookRef.current?.refs.mediaStreamRef.current).toBeNull();
  });
});

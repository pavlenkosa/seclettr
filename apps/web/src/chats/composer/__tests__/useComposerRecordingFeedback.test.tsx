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
import { createRecordingWaveformSeed } from "../../presentation/shared/audio-waveform";
import type {
  ComposerRecordingRuntimeRefs,
  ComposerRecordingStateSetters,
} from "../composer-recording-runtime-shared";
import { useComposerRecordingFeedback } from "../useComposerRecordingFeedback";

class MockAudioContext {
  analyser = {
    fftSize: 0,
    smoothingTimeConstant: 0,
    getByteTimeDomainData: vi.fn((buffer: Uint8Array) => buffer.fill(128)),
  };

  source = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  createAnalyser() {
    return this.analyser as unknown as AnalyserNode;
  }

  createMediaStreamSource() {
    return this.source as unknown as MediaStreamAudioSourceNode;
  }

  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
}

interface FeedbackHookValue {
  preferredRecordMode: "voice" | "video";
  recordingSeconds: number;
  recordingWaveformBars: number[];
  isRecordHintVisible: boolean;
  refs: ComposerRecordingRuntimeRefs;
  handleRecordModeToggle: () => void;
  cleanupRecordingFeedback: () => void;
  startVoiceWaveform: (stream: MediaStream) => void;
}

interface FeedbackHarnessProps {
  readonly hookRef: MutableRefObject<FeedbackHookValue | null>;
  readonly sending?: boolean;
  readonly recordingKind?: "voice" | "video" | null;
}

function FeedbackHarness({
  hookRef,
  sending = false,
  recordingKind = null,
}: FeedbackHarnessProps) {
  const [preferredRecordMode, setPreferredRecordMode] = useState<"voice" | "video">("voice");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingWaveformBars, setRecordingWaveformBars] = useState<number[]>(
    () => createRecordingWaveformSeed()
  );
  const [isRecordHintVisible, setIsRecordHintVisible] = useState(false);

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
    setRecordingKind: vi.fn(),
    setPreferredRecordMode,
    setRecordingSeconds,
    setRecordingWaveformBars,
    setIsRecordHintVisible,
  };

  const hook = useComposerRecordingFeedback({
    sending,
    recordingKind,
    refs,
    setters,
  });

  hookRef.current = {
    ...hook,
    isRecordHintVisible,
    preferredRecordMode,
    recordingSeconds,
    recordingWaveformBars,
    refs,
  };

  return <video ref={previewVideoRef} />;
}

function createMediaStreamStub(): MediaStream {
  return {
    getTracks: () => [],
  } as unknown as MediaStream;
}

describe("useComposerRecordingFeedback", () => {
  let container: HTMLDivElement;
  let root: Root;
  let hookRef: MutableRefObject<FeedbackHookValue | null>;

  beforeEach(() => {
    vi.useFakeTimers();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("AudioContext", MockAudioContext);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    hookRef = { current: null };
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("shows the initial record hint once for eligible direct composer", () => {
    act(() => {
      root.render(<FeedbackHarness hookRef={hookRef} />);
    });

    expect(hookRef.current?.isRecordHintVisible).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2500);
      root.render(<FeedbackHarness hookRef={hookRef} />);
    });

    expect(hookRef.current?.isRecordHintVisible).toBe(false);
  });

  it("toggles preferred record mode and shows the switch hint", () => {
    act(() => {
      root.render(<FeedbackHarness hookRef={hookRef} />);
    });

    act(() => {
      vi.advanceTimersByTime(2500);
      hookRef.current?.handleRecordModeToggle();
    });

    expect(hookRef.current?.preferredRecordMode).toBe("video");
    expect(hookRef.current?.isRecordHintVisible).toBe(true);
  });

  it("starts waveform only when explicitly asked for voice capture and resets on cleanup", () => {
    act(() => {
      root.render(<FeedbackHarness hookRef={hookRef} recordingKind="video" />);
    });

    expect(hookRef.current?.refs.recordingAnalyserRef.current).toBeNull();

    act(() => {
      hookRef.current?.startVoiceWaveform(createMediaStreamStub());
    });

    expect(hookRef.current?.refs.recordingAnalyserRef.current).not.toBeNull();
    expect(hookRef.current?.recordingWaveformBars).toHaveLength(40);

    act(() => {
      hookRef.current?.cleanupRecordingFeedback();
    });

    expect(hookRef.current?.refs.recordingAnalyserRef.current).toBeNull();
    expect(hookRef.current?.recordingWaveformBars).toEqual(createRecordingWaveformSeed());
  });

  it("syncs video preview on video recording and clears it on cleanup", () => {
    const stream = createMediaStreamStub();

    act(() => {
      root.render(<FeedbackHarness hookRef={hookRef} />);
    });

    act(() => {
      if (hookRef.current) {
        hookRef.current.refs.mediaStreamRef.current = stream;
      }
      root.render(<FeedbackHarness hookRef={hookRef} recordingKind="video" />);
    });

    expect(hookRef.current?.refs.previewVideoRef.current?.srcObject).toBe(stream);

    act(() => {
      hookRef.current?.cleanupRecordingFeedback();
    });

    expect(hookRef.current?.refs.previewVideoRef.current?.srcObject).toBeNull();
  });
});

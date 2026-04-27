/**
 * Shared audio activity registry for detecting voice activity from MediaStream audio tracks.
 * Uses WebAudio API's AnalyserNode to compute RMS (Root Mean Square) amplitude.
 */

const AUDIO_ACTIVITY_THRESHOLD = 0.045;

function computeAudioRms(samples: ArrayLike<number>): number {
  if (samples.length === 0) {
    return 0;
  }

  let sum = 0;
  for (const sample of Array.from(samples)) {
    const normalized = ((sample ?? 128) - 128) / 128;
    sum += normalized * normalized;
  }

  return Math.sqrt(sum / samples.length);
}

function isAudioActivityActive(rms: number): boolean {
  return rms > AUDIO_ACTIVITY_THRESHOLD;
}

function getAudioActivityTrackKey(stream: MediaStream | null): string | null {
  const track = stream?.getAudioTracks()[0] ?? null;
  return track?.id ?? null;
}

type AudioContextCtor = typeof AudioContext;
type AudioActivityListener = (isActive: boolean) => void;

interface AudioActivityEntry {
  key: string;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  samples: Uint8Array<ArrayBuffer>;
  listeners: Set<AudioActivityListener>;
  isActive: boolean;
  refCount: number;
}

/**
 * Singleton registry for managing audio activity detection across all call types.
 * Shares a single AudioContext and animation loop for efficiency.
 */
class AudioActivityRegistry {
  private audioContext: AudioContext | null = null;
  private readonly entries = new Map<string, AudioActivityEntry>();
  private frameId: number | null = null;

  private getAudioContext(): AudioContext | null {
    if (globalThis.window === undefined) {
      return null;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      return this.audioContext;
    }

    const AudioContextCtor = resolveAudioContextCtor();
    if (!AudioContextCtor) {
      return null;
    }

    this.audioContext = new AudioContextCtor();
    this.audioContext.resume().catch(() => null);
    return this.audioContext;
  }

  private stopLoopIfIdle(): void {
    if (this.entries.size > 0) {
      return;
    }

    if (this.frameId !== null && globalThis.window !== undefined) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    const currentAudioContext = this.audioContext;
    this.audioContext = null;
    if (currentAudioContext && currentAudioContext.state !== "closed") {
      currentAudioContext.close().catch(() => null);
    }
  }

  private startLoop(): void {
    if (this.frameId !== null || globalThis.window === undefined || this.entries.size === 0) {
      return;
    }

    const tick = () => {
      this.frameId = null;

      for (const entry of this.entries.values()) {
        entry.analyser.getByteTimeDomainData(entry.samples);
        const nextIsActive = isAudioActivityActive(
          computeAudioRms(entry.samples)
        );
        if (entry.isActive === nextIsActive) {
          continue;
        }
        entry.isActive = nextIsActive;
        for (const listener of entry.listeners) {
          listener(nextIsActive);
        }
      }

      if (this.entries.size > 0 && globalThis.window !== undefined) {
        this.frameId = requestAnimationFrame(tick);
      } else {
        this.stopLoopIfIdle();
      }
    };

    this.frameId = requestAnimationFrame(tick);
  }

  /**
   * Subscribe to audio activity changes for a given MediaStream.
   * Multiple listeners can subscribe to the same stream; all will be notified of changes.
   * @returns Unsubscribe function
   */
  subscribe(stream: MediaStream, listener: AudioActivityListener): () => void {
    const key = getAudioActivityTrackKey(stream);
    if (!key) {
      listener(false);
      return () => undefined;
    }

    const audioContext = this.getAudioContext();
    if (!audioContext) {
      listener(false);
      return () => undefined;
    }

    let entry = this.entries.get(key);
    if (!entry) {
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      entry = {
        key,
        source,
        analyser,
        samples: new Uint8Array(new ArrayBuffer(analyser.fftSize)),
        listeners: new Set(),
        isActive: false,
        refCount: 0,
      };
      this.entries.set(key, entry);
    }

    entry.refCount += 1;
    entry.listeners.add(listener);
    listener(entry.isActive);
    this.startLoop();

    return () => {
      const currentEntry = this.entries.get(key);
      if (!currentEntry) {
        return;
      }

      currentEntry.listeners.delete(listener);
      currentEntry.refCount = Math.max(0, currentEntry.refCount - 1);
      if (currentEntry.refCount > 0) {
        return;
      }

      currentEntry.source.disconnect();
      currentEntry.analyser.disconnect();
      this.entries.delete(key);
      this.stopLoopIfIdle();
    };
  }
}

function resolveAudioContextCtor(): AudioContextCtor | null {
  if (globalThis.window === undefined) {
    return null;
  }

  return (
    globalThis.AudioContext ??
    (
      globalThis as typeof globalThis & {
        webkitAudioContext?: AudioContextCtor;
      }
    ).webkitAudioContext ??
    null
  );
}

export const audioActivityRegistry = new AudioActivityRegistry();

const FALLBACK_BAR_TEMPLATE = [0.28, 0.5, 0.66, 0.36, 0.54, 0.78, 0.44, 0.62, 0.32, 0.7, 0.48, 0.74];

export const PLAYBACK_WAVEFORM_BAR_COUNT = 48;
export const RECORDING_WAVEFORM_BAR_COUNT = 40;

type WaveformNormalizationOptions = {
  count: number;
  minBarHeight?: number;
  maxBarHeight?: number;
  curveExponent?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createRepeatedTemplate(count: number): number[] {
  return Array.from(
    { length: count },
    (_, index) => FALLBACK_BAR_TEMPLATE[index % FALLBACK_BAR_TEMPLATE.length] ?? 0.5
  );
}

export function createFallbackWaveform(
  count: number,
  minBarHeight = 0.18,
  maxBarHeight = 0.92
): number[] {
  const base = createRepeatedTemplate(count);
  return normalizeWaveformBars(base, { count, minBarHeight, maxBarHeight });
}

export function createRecordingWaveformSeed(count = RECORDING_WAVEFORM_BAR_COUNT): number[] {
  return Array.from({ length: count }, (_, index) => 0.14 + (index % 4 === 1 ? 0.08 : 0.03));
}

function normalizeWaveformBars(
  values: readonly number[],
  {
    count,
    minBarHeight = 0.16,
    maxBarHeight = 1,
    curveExponent = 0.5,
  }: WaveformNormalizationOptions
): number[] {
  if (count <= 0) return [];

  if (values.length === 0) {
    return createFallbackWaveform(count, minBarHeight, maxBarHeight);
  }

  const bucketSize = Math.max(1, values.length / count);
  const buckets = Array.from({ length: count }, (_, bucketIndex) => {
    const start = Math.floor(bucketIndex * bucketSize);
    const end = Math.max(start + 1, Math.floor((bucketIndex + 1) * bucketSize));
    let peak = 0;

    for (let index = start; index < end && index < values.length; index += 1) {
      peak = Math.max(peak, Math.abs(values[index] ?? 0));
    }

    return peak;
  });

  const peak = Math.max(...buckets, 0.0001);
  return buckets.map((bucket) => {
    const normalized = Math.pow(bucket / peak, curveExponent);
    return clamp(minBarHeight + normalized * (maxBarHeight - minBarHeight), minBarHeight, maxBarHeight);
  });
}

export function buildPlaybackWaveformFromAudioBuffer(
  audioBuffer: AudioBuffer,
  count = PLAYBACK_WAVEFORM_BAR_COUNT
): number[] {
  const frameLength = audioBuffer.length;
  const channelCount = Math.max(1, audioBuffer.numberOfChannels);
  const channelData = Array.from({ length: channelCount }, (_, channelIndex) => audioBuffer.getChannelData(channelIndex));
  const buckets = new Array<number>(count).fill(0);
  const framesPerBar = Math.max(1, Math.floor(frameLength / count));

  for (let barIndex = 0; barIndex < count; barIndex += 1) {
    const start = barIndex * framesPerBar;
    const end = Math.min(frameLength, start + framesPerBar);
    let peak = 0;
    let sumSquares = 0;
    let sumAbs = 0;
    let sampleCount = 0;

    for (let frame = start; frame < end; frame += 1) {
      let mixedSample = 0;
      for (let channel = 0; channel < channelCount; channel += 1) {
        mixedSample += channelData[channel]?.[frame] ?? 0;
      }
      mixedSample /= channelCount;
      const magnitude = Math.abs(mixedSample);
      peak = Math.max(peak, magnitude);
      sumSquares += mixedSample * mixedSample;
      sumAbs += magnitude;
      sampleCount += 1;
    }

    if (sampleCount === 0) {
      buckets[barIndex] = 0;
      continue;
    }

    const rms = Math.sqrt(sumSquares / sampleCount);
    const meanAbs = sumAbs / sampleCount;
    buckets[barIndex] = (rms * 0.68) + (meanAbs * 0.24) + (peak * 0.08);
  }

  const smoothedBuckets = buckets.map((bucket, index, source) => {
    const prev = source[index - 1] ?? bucket;
    const next = source[index + 1] ?? bucket;
    return (prev * 0.22) + (bucket * 0.56) + (next * 0.22);
  });

  return normalizeWaveformBars(smoothedBuckets, {
    count,
    minBarHeight: 0.07,
    maxBarHeight: 0.98,
    curveExponent: 1.08,
  });
}

export async function decodeAudioWaveform(
  blob: Blob,
  count = PLAYBACK_WAVEFORM_BAR_COUNT
): Promise<number[]> {
  if (globalThis.window === undefined) {
    return createFallbackWaveform(count);
  }

  const audioContextCtor = globalThis.AudioContext
    ?? (globalThis as unknown as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!audioContextCtor) {
    return createFallbackWaveform(count);
  }

  const audioContext = new audioContextCtor();

  try {
    const buffer = await blob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));
    return buildPlaybackWaveformFromAudioBuffer(audioBuffer, count);
  } catch {
    return createFallbackWaveform(count);
  } finally {
    await audioContext.close().catch(() => {});
  }
}

export function readLiveWaveformLevel(analyser: AnalyserNode, buffer: Uint8Array): number {
  analyser.getByteTimeDomainData(buffer as Uint8Array<ArrayBuffer>);

  let sum = 0;
  for (const sample of buffer) {
    const centered = ((sample ?? 128) - 128) / 128;
    sum += centered * centered;
  }

  const rms = Math.sqrt(sum / buffer.length);
  return clamp(rms * 3.2, 0, 1);
}

export function pushLiveWaveformLevel(
  current: readonly number[],
  level: number,
  count = RECORDING_WAVEFORM_BAR_COUNT
): number[] {
  const nextLevel = clamp(0.16 + Math.pow(level, 0.72) * 0.84, 0.16, 1);
  const tail = current.slice(-(count - 1));
  return [...tail, nextLevel];
}

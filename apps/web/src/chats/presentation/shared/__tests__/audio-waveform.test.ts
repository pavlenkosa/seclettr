import { describe, expect, it, vi } from "vitest";
import {
  buildPlaybackWaveformFromAudioBuffer,
  createFallbackWaveform,
  createRecordingWaveformSeed,
  PLAYBACK_WAVEFORM_BAR_COUNT,
  RECORDING_WAVEFORM_BAR_COUNT,
  readLiveWaveformLevel,
  pushLiveWaveformLevel,
} from "../audio-waveform";

function createAudioBufferStub(samples: Float32Array): AudioBuffer {
  return {
    length: samples.length,
    numberOfChannels: 1,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

describe("createFallbackWaveform", () => {
  it("returns the requested count of bars", () => {
    expect(createFallbackWaveform(12)).toHaveLength(12);
    expect(createFallbackWaveform(48)).toHaveLength(PLAYBACK_WAVEFORM_BAR_COUNT);
  });

  it("returns empty array for count 0", () => {
    expect(createFallbackWaveform(0)).toHaveLength(0);
  });

  it("all bars are within [minBarHeight, maxBarHeight]", () => {
    const min = 0.18;
    const max = 0.92;
    const bars = createFallbackWaveform(24, min, max);
    for (const bar of bars) {
      expect(bar).toBeGreaterThanOrEqual(min);
      expect(bar).toBeLessThanOrEqual(max);
    }
  });
});

describe("createRecordingWaveformSeed", () => {
  it("returns RECORDING_WAVEFORM_BAR_COUNT bars by default", () => {
    expect(createRecordingWaveformSeed()).toHaveLength(RECORDING_WAVEFORM_BAR_COUNT);
  });

  it("returns the requested count", () => {
    expect(createRecordingWaveformSeed(10)).toHaveLength(10);
  });

  it("all values are positive", () => {
    const bars = createRecordingWaveformSeed();
    for (const bar of bars) {
      expect(bar).toBeGreaterThan(0);
    }
  });
});

describe("readLiveWaveformLevel", () => {
  it("returns 0 for silent buffer (all 128 = center)", () => {
    const buffer = new Uint8Array(256).fill(128);
    const analyser = {
      getByteTimeDomainData: vi.fn((buf: Uint8Array) => buf.fill(128)),
    } as unknown as AnalyserNode;
    const level = readLiveWaveformLevel(analyser, buffer);
    expect(level).toBeCloseTo(0, 5);
  });

  it("returns a positive value for a signal with amplitude", () => {
    const buffer = new Uint8Array(256);
    // Alternate between 128+64 and 128-64 to create a signal
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = i % 2 === 0 ? 192 : 64;
    }
    const analyser = {
      getByteTimeDomainData: vi.fn((buf: Uint8Array) => {
        for (let i = 0; i < buf.length; i++) buf[i] = buffer[i] ?? 128;
      }),
    } as unknown as AnalyserNode;
    const level = readLiveWaveformLevel(analyser, buffer);
    expect(level).toBeGreaterThan(0);
    expect(level).toBeLessThanOrEqual(1);
  });
});

describe("pushLiveWaveformLevel", () => {
  it("shifts old values and appends the new level", () => {
    const current = [0.2, 0.4, 0.6];
    const result = pushLiveWaveformLevel(current, 0.5, 3);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(0.4);
    expect(result[1]).toBe(0.6);
  });

  it("clamps the appended level to [0.16, 1]", () => {
    const result1 = pushLiveWaveformLevel([], 0, 1);
    expect(result1[0]).toBeGreaterThanOrEqual(0.16);

    const result2 = pushLiveWaveformLevel([], 100, 1);
    expect(result2[0]).toBeLessThanOrEqual(1);
  });

  it("grows toward the requested count", () => {
    let bars: readonly number[] = [];
    for (let i = 0; i < 5; i++) {
      bars = pushLiveWaveformLevel(bars, 0.5, 5);
    }
    expect(bars).toHaveLength(5);
  });
});

describe("buildPlaybackWaveformFromAudioBuffer", () => {
  it("reflects louder regions with taller bars", () => {
    const samples = new Float32Array(1_200);

    for (let index = 0; index < samples.length; index += 1) {
      const phase = (index / 12) * Math.PI;
      if (index < 400) {
        samples[index] = 0;
      } else if (index < 800) {
        samples[index] = Math.sin(phase) * 0.18;
      } else {
        samples[index] = Math.sin(phase) * 0.82;
      }
    }

    const bars = buildPlaybackWaveformFromAudioBuffer(createAudioBufferStub(samples), 12);
    const quietAverage = bars.slice(0, 4).reduce((sum, value) => sum + value, 0) / 4;
    const midAverage = bars.slice(4, 8).reduce((sum, value) => sum + value, 0) / 4;
    const loudAverage = bars.slice(8, 12).reduce((sum, value) => sum + value, 0) / 4;

    expect(quietAverage).toBeLessThan(midAverage);
    expect(midAverage).toBeLessThan(loudAverage);
  });
});

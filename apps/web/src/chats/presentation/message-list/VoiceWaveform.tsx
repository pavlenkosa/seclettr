import type { CSSProperties } from "react";
import styles from "../MessageList.module.css";
import {
  createFallbackWaveform,
  PLAYBACK_WAVEFORM_BAR_COUNT,
} from "../shared/audio-waveform";

/**
 * Props for deterministic waveform rendering in voice-note playback.
 */
interface VoiceWaveformProps {
  readonly messageId: string;
  readonly progressRatio: number;
  readonly bars?: readonly number[];
}

const MAX_RENDER_BARS = 48;

function downsampleWaveformBars(sourceBars: readonly number[]): readonly number[] {
  if (sourceBars.length <= MAX_RENDER_BARS) {
    return sourceBars;
  }

  const segmentSize = sourceBars.length / MAX_RENDER_BARS;
  return Array.from({ length: MAX_RENDER_BARS }, (_, index) => {
    const start = Math.floor(index * segmentSize);
    const end = Math.max(start + 1, Math.floor((index + 1) * segmentSize));
    let peak = 0;
    for (let cursor = start; cursor < end; cursor += 1) {
      peak = Math.max(peak, sourceBars[cursor] ?? 0);
    }
    return peak;
  });
}

/**
 * Lightweight waveform view used by encrypted voice-note playback UI.
 */
export function VoiceWaveform({ messageId, progressRatio, bars }: VoiceWaveformProps) {
  const waveformBars = bars?.length
    ? downsampleWaveformBars(bars)
    : createFallbackWaveform(PLAYBACK_WAVEFORM_BAR_COUNT);

  return (
    <div className={styles.voiceWave} aria-hidden="true">
      {waveformBars.map((barLevel, index) => (
        <span
          key={`${messageId}-${index}`}
          className={`${styles.voiceBar} ${index / Math.max(waveformBars.length - 1, 1) <= progressRatio ? styles.voiceBarActive : ""}`}
          style={{ "--voice-bar-level": `${barLevel}` } as CSSProperties}
        />
      ))}
    </div>
  );
}

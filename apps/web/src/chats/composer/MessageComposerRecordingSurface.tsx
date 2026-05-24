import type { CSSProperties } from "react";
import { RECORDING_WAVEFORM_BAR_COUNT } from "../presentation/shared/audio-waveform";
import { VideoNoteIcon } from "./MessageComposerIcons";
import styles from "./MessageComposerRecording.module.css";

const WAVEFORM_BAR_KEYS = Array.from({ length: RECORDING_WAVEFORM_BAR_COUNT }, (_, i) => `wave-bar-${i}`);

/**
 * Props for the inline recording surface rendered inside the composer shell.
 */
export interface MessageComposerRecordingSurfaceProps {
  readonly isVideoRecording: boolean;
  readonly recordingStageTitle: string;
  readonly recordingStageStatus: string;
  readonly recordingStageHint: string;
  readonly recordingElapsedLabel: string;
  readonly recordingWaveformBars: readonly number[];
}

/**
 * Active recording panel that replaces text input while voice/video capture is running.
 */
export function MessageComposerRecordingSurface({
  isVideoRecording,
  recordingStageTitle,
  recordingStageStatus,
  recordingStageHint,
  recordingElapsedLabel,
  recordingWaveformBars,
}: MessageComposerRecordingSurfaceProps) {
  return (
    <div
      className={`${styles.recordingSurface} ${
        isVideoRecording ? styles.recordingSurfaceVideo : styles.recordingSurfaceVoice
      }`}
      aria-live="polite"
    >
      {isVideoRecording ? (
        <>
          <div className={styles.recordingModeBadge} aria-hidden="true">
            <VideoNoteIcon />
          </div>
          <div className={styles.recordingVideoStrip}>
            <div className={styles.recordingStageEyebrow}>{recordingStageTitle}</div>
            <div className={styles.recordingStageMeta}>
              <span className={styles.recordingDot} aria-hidden="true" />
              <span className={styles.recordingStageMetaStrong}>{recordingElapsedLabel}</span>
              <span className={styles.recordingStageSeparator} aria-hidden="true" />
              <span>{recordingStageHint}</span>
            </div>
          </div>
        </>
      ) : (
        <div className={styles.recordingVoiceStrip}>
          <div className={styles.recordingVoiceShell} aria-hidden="true">
            <span className={styles.recordingVoicePulse} />
          </div>

          <div className={styles.recordingVoiceTrack}>
            <div className={styles.recordingVoiceHeader}>
              <span className={styles.recordingVoiceTitle}>{recordingStageStatus}</span>
              <span className={styles.recordingStageSeparator} aria-hidden="true" />
              <span className={styles.recordingVoiceHint}>{recordingStageHint}</span>
            </div>
            <div className={styles.recordingVoiceWaveform} aria-hidden="true">
              {recordingWaveformBars.map((barLevel, index) => (
                <span
                  key={WAVEFORM_BAR_KEYS[index]}
                  className={styles.recordingVoiceWaveformBar}
                  style={{ "--recording-wave-level": `${barLevel}` } as CSSProperties}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

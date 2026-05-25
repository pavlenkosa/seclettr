import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n";
import styles from "./MessageComposerRecording.module.css";

/**
 * Props for the full-screen video recording overlay shown while capturing a video note.
 */
export interface MessageComposerVideoRecordingOverlayProps {
  readonly previewVideoRef: RefObject<HTMLVideoElement>;
  readonly recordingStageTitle: string;
  readonly recordingStageStatus: string;
  readonly recordingElapsedLabel: string;
  readonly recordingStageHint: string;
  readonly cancelRecordingAriaLabel: string;
  readonly cancelRecordingTitle: string;
  readonly stopRecordingAriaLabel: string;
  readonly stopRecordingTitle: string;
  readonly onCancelRecording: () => void;
  readonly onStopRecording: () => void;
}

/**
 * Floating overlay that keeps video-note capture state visible and explicit.
 */
export function MessageComposerVideoRecordingOverlay({
  previewVideoRef,
  recordingStageTitle,
  recordingStageStatus,
  recordingElapsedLabel,
  recordingStageHint,
  cancelRecordingAriaLabel,
  cancelRecordingTitle,
  stopRecordingAriaLabel,
  stopRecordingTitle,
  onCancelRecording,
  onStopRecording,
}: MessageComposerVideoRecordingOverlayProps) {
  const { t } = useI18n();

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className={styles.videoRecordingOverlay}>
      <div className={styles.videoRecordingOverlayChrome}>
        <div className={styles.videoRecordingOverlayEyebrow}>{recordingStageTitle}</div>
        <div className={styles.videoRecordingOverlayTitle}>{recordingStageStatus}</div>
      </div>

      <div className={styles.videoRecordingOverlayCircle}>
        <span className={styles.videoRecordingOverlayGlow} />
        <div className={styles.recordingVideoShell}>
          <video
            ref={previewVideoRef}
            className={styles.recordingVideoPreview}
            muted
            autoPlay
            playsInline
            aria-label={t("composer.aria.videoRecordingPreview")}
          />
          <span className={styles.recordingVideoFrame} aria-hidden="true" />
          <span className={styles.recordingVideoTimeBadge}>{recordingElapsedLabel}</span>
        </div>
      </div>

      <div className={styles.videoRecordingOverlayFooter}>
        <span className={styles.recordingDot} aria-hidden="true" />
        <span className={styles.videoRecordingOverlayFooterStrong}>{recordingElapsedLabel}</span>
        <span className={styles.recordingStageSeparator} aria-hidden="true" />
        <span>{recordingStageHint}</span>
      </div>

      <div className={styles.videoRecordingOverlayControls}>
        <button
          type="button"
          className={styles.videoRecordingOverlayCancelBtn}
          onClick={onCancelRecording}
          aria-label={cancelRecordingAriaLabel}
          title={cancelRecordingTitle}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
        </button>
        <button
          type="button"
          className={styles.videoRecordingOverlayStopBtn}
          onClick={onStopRecording}
          aria-label={stopRecordingAriaLabel}
          title={stopRecordingTitle}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <rect x="4.25" y="4.25" width="9.5" height="9.5" rx="2.1" fill="currentColor" />
          </svg>
        </button>
      </div>
    </div>,
    document.body,
  );
}

import type { CSSProperties } from "react";
import styles from "./MessageListAttachments.module.css";

interface AttachmentUploadRingProps {
  readonly progress: number;
  readonly onCancel: () => void;
  readonly ariaLabel: string;
  readonly compact?: boolean;
}

interface InlineAttachmentUploadOverlayProps extends AttachmentUploadRingProps {
  readonly progressLabel?: string;
}

export function AttachmentUploadRing({
  progress,
  onCancel,
  ariaLabel,
  compact = false,
}: AttachmentUploadRingProps) {
  const normalizedProgress = Math.max(0, Math.min(100, progress));
  const isAnimating = normalizedProgress < 100;
  const circleRadius = 20;
  const circleCircumference = Math.PI * 2 * circleRadius;
  const circleOffset = circleCircumference * (1 - normalizedProgress / 100);
  const style = {
    "--upload-ring-progress": normalizedProgress,
    "--upload-ring-circumference": circleCircumference,
    "--upload-ring-offset": circleOffset,
  } as CSSProperties;

  return (
    <div
      className={`${styles.uploadRing} ${compact ? styles.uploadRingCompact : ""}`}
      style={style}
    >
      <svg
        className={styles.uploadRingSvg}
        viewBox="0 0 48 48"
        aria-hidden="true"
      >
        <circle className={styles.uploadRingTrack} cx="24" cy="24" r={circleRadius} />
        <circle
          className={`${styles.uploadRingProgress} ${isAnimating ? styles.uploadRingProgressAnimated : ""}`}
          cx="24"
          cy="24"
          r={circleRadius}
        />
      </svg>
      <button
        type="button"
        className={styles.uploadRingCancel}
        onClick={(event) => {
          event.stopPropagation();
          onCancel();
        }}
        aria-label={ariaLabel}
      >
        <span className={styles.uploadRingStop} />
      </button>
    </div>
  );
}

export function InlineAttachmentUploadOverlay({
  progress,
  onCancel,
  ariaLabel,
  progressLabel,
  compact = false,
}: InlineAttachmentUploadOverlayProps) {
  return (
    <div
      className={styles.inlineMediaUploadOverlay}
      role="none"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <AttachmentUploadRing
        progress={progress}
        onCancel={onCancel}
        ariaLabel={ariaLabel}
        compact={compact}
      />
      <span className={styles.uploadRingLabel}>
        {progressLabel ?? `${Math.round(progress)}%`}
      </span>
    </div>
  );
}

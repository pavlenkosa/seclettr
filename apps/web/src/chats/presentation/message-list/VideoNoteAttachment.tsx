import type { CSSProperties } from "react";
import { useI18n } from "@/i18n";
import { useSecuritySettings } from "@/ui-settings";
import { useVideoNoteAttachmentRuntime } from "@/chats/runtime/useVideoNoteAttachmentRuntime";
import { useUploadProgress } from "@/chats/runtime/useUploadProgress";
import type { Message } from "@/stores/messages";
import { AttachmentUploadRing } from "./AttachmentUploadProgress";
import { MessageStatusIcon } from "./MessageStatusIcon";
import { resolveAttachmentErrorMessage, type MediaPlaybackProps } from "./message-attachment-shared";
import { formatClock, formatTime } from "./message-list-presentation";
import styles from "../MessageList.module.css";

/**
 * Interactive video-note attachment renderer with decrypt/playback controls.
 */
export function VideoNoteAttachment({
  msg,
  isOwn,
  mediaKey,
  activeMediaKey,
  onActiveMediaChange,
}: { msg: Message; isOwn: boolean } & MediaPlaybackProps) {
  const { t, locale } = useI18n();
  const { autoDecryptMedia } = useSecuritySettings();
  const { progress: uploadProgress, cancel: cancelUpload } = useUploadProgress(msg.id);
  const {
    videoRef,
    videoUrl,
    loading,
    errorCause,
    isPlaying,
    currentTime,
    duration,
    loadAndMaybePlay,
    togglePlayback,
  } = useVideoNoteAttachmentRuntime({
    attachment: msg.attachment,
    messageId: msg.id,
    mediaKey,
    activeMediaKey,
    onActiveMediaChange,
    autoDecrypt: (autoDecryptMedia === "on" || !!msg.attachment?.isPlain) && uploadProgress === null,
  });

  const expectedDurationSeconds = duration > 0
    ? duration
    : Math.max(1, Math.round((msg.attachment?.durationMs ?? 0) / 1000));
  const remainingSeconds = Math.max(0, expectedDurationSeconds - currentTime);
  const progressRatio = Math.max(0, Math.min(1, currentTime / Math.max(expectedDurationSeconds, 1)));
  const progressStyle = {
    "--video-progress": `${Math.round(progressRatio * 360)}deg`,
  } as CSSProperties;
  const messageTimeLabel = formatTime(msg.timestamp, locale);
  const durationLabel = msg.attachment?.durationMs ? formatClock(Math.round(msg.attachment.durationMs / 1000)) : "";
  const isPlain = !!msg.attachment?.isPlain;
  const error = resolveAttachmentErrorMessage("video", errorCause, t, isPlain);

  const videoNoteControl = videoUrl ? (
    <button
      type="button"
      className={styles.videoCircleButton}
      style={progressStyle}
      onClick={() => void togglePlayback()}
      aria-label={isPlaying ? t("message.video.pauseAria") : t("message.video.playAria")}
    >
      <video
        ref={videoRef}
        className={styles.videoCircle}
        preload="metadata"
        playsInline
        src={videoUrl}
      >
        <track kind="captions" />
      </video>
      <span className={styles.videoProgressRing} aria-hidden="true" />
      {isPlaying ? null : (
        <span className={styles.videoPlayOverlay} aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none">
            <path d="M7.1 4.85a1.08 1.08 0 0 1 1.63-.93l7.2 4.47a1.08 1.08 0 0 1 0 1.84l-7.2 4.47a1.08 1.08 0 0 1-1.63-.93V4.85Z" fill="currentColor" />
          </svg>
        </span>
      )}
      <span className={styles.videoTimeOverlay}>
        -{formatClock(remainingSeconds)}
      </span>
    </button>
  ) : (
    <button
      type="button"
      onClick={() => void loadAndMaybePlay(true)}
      disabled={loading}
      className={`${styles.fileDecryptBtn} ${styles.videoDecryptBtn}`}
      aria-label={t(isPlain ? "message.video.loadAria" : "message.video.decryptAria")}
    >
      <span className={styles.videoDecryptCircle} aria-hidden="true">
        <span className={styles.videoDecryptBlur} />
        <span className={styles.videoDecryptLock}>
          <svg viewBox="0 0 18 18" fill="none">
            <path
              d="M5.7 8.05V6.7a3.3 3.3 0 1 1 6.6 0v1.35"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <rect
              x="4.35"
              y="8.05"
              width="9.3"
              height="6.25"
              rx="2.05"
              fill="currentColor"
              fillOpacity="0.18"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <circle cx="9" cy="11.2" r="1" fill="currentColor" />
          </svg>
        </span>
      </span>
      <span className={styles.videoDecryptLabel}>
        {loading
          ? t(isPlain ? "message.video.loading" : "message.video.decrypting")
          : t(isPlain ? "message.video.tapToPlay" : "message.video.decryptAndPlay")}
      </span>
    </button>
  );

  return (
    <div className={`${styles.videoNote} ${isOwn ? styles.voiceOwn : styles.voiceTheirs}`}>
      {uploadProgress === null ? videoNoteControl : (
        <div className={styles.videoCircleButton}>
          <span className={styles.videoUploadPlaceholder} aria-hidden="true" />
          <div className={styles.videoUploadOverlay}>
            <AttachmentUploadRing
              progress={uploadProgress}
              onCancel={cancelUpload}
              ariaLabel={t("message.upload.cancel")}
            />
            <span className={styles.uploadRingLabel}>{Math.round(uploadProgress)}%</span>
          </div>
        </div>
      )}
      <div className={styles.videoMeta}>
        <span className={styles.videoMetaLeft}>{durationLabel}</span>
        <span className={styles.videoMetaRight}>
          <span>{messageTimeLabel}</span>
          {isOwn ? <MessageStatusIcon status={msg.status} /> : null}
        </span>
      </div>
      {error ? <div className={styles.voiceError}>{error}</div> : null}
    </div>
  );
}

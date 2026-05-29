import type { CSSProperties } from "react";
import { useI18n } from "@/i18n";
import { useSecuritySettings } from "@/ui-settings";
import { useVideoNoteAttachmentRuntime } from "@/chats/runtime/useVideoNoteAttachmentRuntime";
import { useExitingUploadProgress } from "@/chats/runtime/useUploadProgress";
import { InlineNotice } from "@/components/ui";
import type { Message } from "@/stores/messages";
import { AttachmentUploadRing } from "./AttachmentUploadProgress";
import { MessageStatusIcon } from "./MessageStatusIcon";
import { resolveAttachmentErrorMessage, type MediaPlaybackProps } from "./message-attachment-shared";
import { formatClock, formatTime } from "./message-list-presentation";
import styles from "../MessageList.module.css";
import attachmentStyles from "./MessageListAttachments.module.css";

function PlayIcon(props: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" {...props}>
      <path d="M7.1 4.85a1.08 1.08 0 0 1 1.63-.93l7.2 4.47a1.08 1.08 0 0 1 0 1.84l-7.2 4.47a1.08 1.08 0 0 1-1.63-.93V4.85Z" fill="currentColor" />
    </svg>
  );
}

function PlayPlainIcon(props: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 18 18" fill="none" {...props}>
      <path d="M6 4.5l8 4.5-8 4.5V4.5Z" fill="currentColor" />
    </svg>
  );
}

function LockIcon(props: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 18 18" fill="none" {...props}>
      <path d="M5.7 8.05V6.7a3.3 3.3 0 1 1 6.6 0v1.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="4.35" y="8.05" width="9.3" height="6.25" rx="2.05" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="9" cy="11.2" r="1" fill="currentColor" />
    </svg>
  );
}

function VideoNoteCircleContent({
  videoUrl, loading, isPlain, videoRef, isPlaying, remainingSeconds,
}: {
  videoUrl: string | null;
  loading: boolean;
  isPlain: boolean;
  videoRef: import("react").RefObject<HTMLVideoElement>;
  isPlaying: boolean;
  remainingSeconds: number;
}) {
  const handleLoadedMetadata = () => {
    const el = videoRef.current;
    if (el && el.paused && el.currentTime === 0) {
      el.currentTime = 0.001;
    }
  };

  if (videoUrl) {
    return (
      <>
        <video ref={videoRef} className={styles.videoCircle} preload="metadata" playsInline src={videoUrl} onLoadedMetadata={handleLoadedMetadata}>
          <track kind="captions" />
        </video>
        <span className={styles.videoProgressRing} aria-hidden="true" />
        {isPlaying ? null : (
          <span className={styles.videoPlayOverlay} aria-hidden="true">
            <PlayIcon />
          </span>
        )}
        <span className={styles.videoTimeOverlay}>-{formatClock(remainingSeconds)}</span>
      </>
    );
  }

  if (loading) {
    return (
      <div className={styles.videoCircleGlyph} aria-hidden="true">
        <span className={styles.videoCircleSpinner} />
      </div>
    );
  }

  return (
    <div className={styles.videoCircleGlyph} aria-hidden="true">
      <span className={styles.videoCircleGlyphBadge}>
        {isPlain ? <PlayPlainIcon /> : <LockIcon />}
      </span>
    </div>
  );
}

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
  const {
    progress: uploadProgress,      // raw — null the moment upload finishes; used for autoDecrypt gate
    displayProgress: uploadDisplayProgress,
    isExiting: uploadExiting,
    cancel: cancelUpload,
  } = useExitingUploadProgress(msg.id);
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

  const isUploadActive = uploadDisplayProgress !== null;

  const handleClick = () => {
    if (isUploadActive) return;
    if (videoUrl) void togglePlayback();
    else void loadAndMaybePlay(true);
  };

  const ariaLabel = t(
    videoUrl
      ? (isPlaying ? "message.video.pauseAria" : "message.video.playAria")
      : (isPlain ? "message.video.loadAria" : "message.video.decryptAria")
  );

  return (
    <div className={`${styles.videoNote} ${isOwn ? styles.voiceOwn : styles.voiceTheirs}`}>
      <button
        type="button"
        className={styles.videoCircleButton}
        style={videoUrl ? progressStyle : undefined}
        onClick={handleClick}
        disabled={isUploadActive || (loading && !videoUrl)}
        aria-label={ariaLabel}
      >
        <VideoNoteCircleContent
          videoUrl={videoUrl}
          loading={loading}
          isPlain={isPlain}
          videoRef={videoRef}
          isPlaying={isPlaying}
          remainingSeconds={remainingSeconds}
        />
        {isUploadActive && (
          <div
            className={styles.videoUploadOverlay}
            data-exiting={uploadExiting ? "true" : undefined}
          >
            <AttachmentUploadRing
              progress={uploadDisplayProgress ?? 100}
              onCancel={cancelUpload}
              ariaLabel={t("message.upload.cancel")}
            />
            <span className={attachmentStyles.uploadRingLabel}>
              {Math.round(uploadDisplayProgress ?? 100)}%
            </span>
          </div>
        )}
      </button>

      <div className={styles.videoMeta}>
        <span className={styles.videoMetaLeft}>{durationLabel}</span>
        <span className={styles.videoMetaRight}>
          <span>{messageTimeLabel}</span>
          {isOwn ? <MessageStatusIcon status={msg.status} /> : null}
        </span>
      </div>
      {error ? (
        <InlineNotice
          tone="error"
          size="sm"
          role="alert"
          className={styles.attachmentErrorNotice}
        >
          {error}
        </InlineNotice>
      ) : null}
    </div>
  );
}

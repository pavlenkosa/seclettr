import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { useSecuritySettings } from "@/ui-settings";
import { useFileAttachmentRuntime } from "@/chats/runtime/useFileAttachmentRuntime";
import { useExitingUploadProgress } from "@/chats/runtime/useUploadProgress";
import { MediaLightbox } from "@/components/common/MediaLightbox";
import { InlineNotice } from "@/components/ui";
import type { Message } from "@/stores/messages";
import { InlineAttachmentUploadOverlay } from "./AttachmentUploadProgress";
import { MessageStatusIcon } from "./MessageStatusIcon";
import { resolveAttachmentErrorMessage } from "./message-attachment-shared";
import { formatTime } from "./message-list-presentation";
import rowStyles from "../MessageList.module.css";
import styles from "./MessageListAttachments.module.css";

type InlineMediaPreviewProps = Readonly<{
  isVideo: boolean;
  previewUrl: string | null;
  /** Computed alt text: caption > fileName > generic i18n label. */
  altText: string;
  hidden: boolean;
  onReady: () => void;
}>;

type InlineMediaPlaceholderProps = Readonly<{
  isVideo: boolean;
  loading: boolean;
  /** Plain attachments aren't encrypted — show a shimmer instead of the lock glyph. */
  isPlain: boolean;
  isOwn: boolean;
}>;

type InlineMediaAttachmentProps = Readonly<{
  msg: Message;
  isOwn: boolean;
}>;

function InlineMediaPreview({
  isVideo,
  previewUrl,
  altText,
  hidden,
  onReady,
}: InlineMediaPreviewProps) {
  // When hidden, the element stays in the DOM so loading proceeds, but takes
  // no layout space. Once onReady fires the parent swaps it visible.
  const hiddenStyle = hidden
    ? ({ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0, overflow: "hidden" } as const)
    : undefined;

  if (isVideo) {
    return (
      <video
        src={previewUrl ?? undefined}
        className={styles.inlineMediaThumb}
        style={hiddenStyle}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => {
          e.currentTarget.currentTime = 0.001;
          onReady();
        }}
      />
    );
  }

  return (
    <img
      src={previewUrl ?? undefined}
      className={styles.inlineMediaThumb}
      style={hiddenStyle}
      alt={altText}
      draggable={false}
      onLoad={onReady}
    />
  );
}

function InlineMediaPlaceholder({ isVideo, loading, isPlain, isOwn }: InlineMediaPlaceholderProps) {
  const restingGlyph = isPlain
    ? <span className={styles.inlineMediaShimmer} aria-hidden="true" />
    : (
      <span className={styles.inlineMediaLock} aria-hidden="true">
        <svg viewBox="0 0 20 20" fill="none">
          <path d="M6.5 9V7a3.5 3.5 0 0 1 7 0v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <rect x="4.5" y="9" width="11" height="7.5" rx="2.2" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="10" cy="12.8" r="1.1" fill="currentColor" />
        </svg>
      </span>
    );

  const placeholderClass = isVideo
    ? `${styles.inlineMediaPlaceholder} ${styles.inlineMediaPlaceholderVideo}`
    : styles.inlineMediaPlaceholder;
  const ownClassName = isOwn ? styles.inlineMediaPlaceholderOwn : "";

  return (
    <div className={`${placeholderClass} ${ownClassName}`}>
      {loading ? (
        <span className={styles.inlineMediaSpinner} aria-hidden="true" />
      ) : restingGlyph}
      {isVideo ? (
        <span className={styles.inlineMediaTypeLabel} aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
            <path d="M2.5 4.5h7a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.2" />
            <path d="M10.5 7l3-1.5v5L10.5 9" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        </span>
      ) : null}
    </div>
  );
}

/**
 * Inline image / video attachment — shows a thumbnail in the bubble, opens a
 * fullscreen lightbox on tap. Media is decrypted on first interaction; the
 * resulting blob URL is kept alive for the lifetime of the message row.
 *
 * The placeholder is kept visible until the media element fires its load event
 * so the badge never appears at the wrong position and the list never reflows
 * from 0-height to natural-height in the same frame.
 */
export function InlineMediaAttachment({ msg, isOwn }: InlineMediaAttachmentProps) {
  const { t, locale } = useI18n();
  const { autoDecryptMedia } = useSecuritySettings();
  const {
    loading,
    previewUrl: hookPreviewUrl,
    errorCause,
    decryptAndPreview,
    decryptAndDownload,
  } = useFileAttachmentRuntime({
    attachment: msg.attachment,
    messageId: msg.id,
  });
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const {
    progress: uploadProgress,
    displayProgress: uploadDisplayProgress,
    isExiting: uploadExiting,
    cancel: cancelUpload,
  } = useExitingUploadProgress(msg.id);

  const plainLocalUrl = msg.attachment?.isPlain ? msg.attachment.localUrl ?? null : null;
  const previewUrl = plainLocalUrl ?? hookPreviewUrl;

  // Track whether the media element has finished loading so the badge is only
  // shown once it's at the correct bottom-right position.
  const [mediaLoaded, setMediaLoaded] = useState(false);
  const prevPreviewUrlRef = useRef<string | null>(null);
  useEffect(() => {
    // When a URL becomes available for the first time, ensure loaded state is
    // false so the placeholder is displayed while the element decodes.
    if (previewUrl !== null && prevPreviewUrlRef.current === null) {
      setMediaLoaded(false);
    }
    prevPreviewUrlRef.current = previewUrl;
  }, [previewUrl]);

  const handleMediaReady = useCallback(() => setMediaLoaded(true), []);

  const isVideo = msg.attachment?.mimeType.startsWith("video/") ?? false;
  const messageTimeLabel = formatTime(msg.timestamp, locale);
  const error = resolveAttachmentErrorMessage("file", errorCause, t, !!msg.attachment?.isPlain);

  // Badge rendered only after media is loaded — prevents it from floating at
  // (0, 0) while the image element hasn't yet reported its natural dimensions.
  const mediaMetaOverlay = previewUrl && mediaLoaded ? (
    <div className={styles.inlineMediaMeta} aria-hidden="true">
      <span>{messageTimeLabel}</span>
      {isOwn ? <MessageStatusIcon status={msg.status} /> : null}
    </div>
  ) : null;

  useEffect(() => {
    if (
      (autoDecryptMedia === "on" || !!msg.attachment?.isPlain) &&
      uploadProgress === null && // use raw progress so decrypt starts immediately on upload done
      !previewUrl &&
      !loading &&
      !errorCause
    ) {
      void decryptAndPreview();
    }
  }, [autoDecryptMedia, decryptAndPreview, errorCause, loading, msg.attachment?.attachmentId, msg.attachment?.isPlain, previewUrl, uploadProgress]);

  const handleTap = async () => {
    if (uploadDisplayProgress !== null) return; // block tap during upload and exit fade
    if (previewUrl) {
      setLightboxOpen(true);
      return;
    }
    const url = await decryptAndPreview();
    if (url) setLightboxOpen(true);
  };

  // Show placeholder while no previewUrl OR while previewUrl is set but the
  // media element hasn't fired its load/loadedmetadata event yet.
  const showPlaceholder = !previewUrl || !mediaLoaded;

  return (
    <div className={`${styles.inlineMedia} ${isOwn ? rowStyles.voiceOwn : rowStyles.voiceTheirs}`}>
      <div className={styles.inlineMediaFrame}>
        <button
          type="button"
          className={styles.inlineMediaBtn}
          onClick={() => void handleTap()}
          disabled={uploadDisplayProgress !== null || (loading && !previewUrl)}
          aria-label={t(isVideo ? "message.media.tapToPlayVideo" : "message.media.tapToViewImage")}
        >
          {showPlaceholder ? (
            <InlineMediaPlaceholder
              isVideo={isVideo}
              loading={loading}
              isPlain={!!msg.attachment?.isPlain}
              isOwn={isOwn}
            />
          ) : null}

          {/* Render the media element early (hidden) so it starts loading while
              the placeholder is still displayed. Once onReady fires, the
              placeholder is removed and the element becomes visible. */}
          {previewUrl ? (
            <InlineMediaPreview
              isVideo={isVideo}
              previewUrl={previewUrl}
              altText={
                msg.attachment?.caption ||
                msg.attachment?.fileName ||
                t(isVideo ? "message.media.videoAlt" : "message.media.imageAlt")
              }
              hidden={!mediaLoaded}
              onReady={handleMediaReady}
            />
          ) : null}

          {mediaLoaded && previewUrl && isVideo ? (
            <span className={styles.inlineMediaPlayOverlay} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="11" fill="rgb(0 0 0 / 0.48)" />
                <path d="M10 8.5l6 3.5-6 3.5V8.5Z" fill="currentColor" />
              </svg>
            </span>
          ) : null}
        </button>

        {uploadDisplayProgress === null ? mediaMetaOverlay : (
          <InlineAttachmentUploadOverlay
            progress={uploadDisplayProgress}
            onCancel={cancelUpload}
            ariaLabel={t("message.upload.cancel")}
            exiting={uploadExiting}
          />
        )}
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

      {previewUrl ? (
        <MediaLightbox
          isOpen={lightboxOpen}
          url={previewUrl}
          mimeType={msg.attachment?.mimeType ?? ""}
          caption={msg.attachment?.caption}
          fileName={msg.attachment?.fileName}
          onClose={() => setLightboxOpen(false)}
          onDownload={() => void decryptAndDownload()}
          downloading={loading}
        />
      ) : null}
    </div>
  );
}

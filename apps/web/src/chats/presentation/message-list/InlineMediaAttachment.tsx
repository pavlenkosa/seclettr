import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { useSecuritySettings } from "@/ui-settings";
import { useFileAttachmentRuntime } from "@/chats/runtime/useFileAttachmentRuntime";
import { useUploadProgress } from "@/chats/runtime/useUploadProgress";
import { MediaLightbox } from "@/components/common/MediaLightbox";
import type { Message } from "@/stores/messages";
import { InlineAttachmentUploadOverlay } from "./AttachmentUploadProgress";
import { MessageStatusIcon } from "./MessageStatusIcon";
import { resolveAttachmentErrorMessage } from "./message-attachment-shared";
import { formatTime } from "./message-list-presentation";
import styles from "../MessageList.module.css";

type InlineMediaPreviewProps = Readonly<{
  isVideo: boolean;
  previewUrl: string | null;
  fileName?: string;
}>;

type InlineMediaPlaceholderProps = Readonly<{
  isVideo: boolean;
  loading: boolean;
}>;

type InlineMediaAttachmentProps = Readonly<{
  msg: Message;
  isOwn: boolean;
}>;

function InlineMediaPreview({
  isVideo,
  previewUrl,
  fileName,
}: InlineMediaPreviewProps) {
  if (isVideo) {
    return (
      <video
        src={previewUrl ?? undefined}
        className={styles.inlineMediaThumb}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={(e) => { e.currentTarget.currentTime = 0.001; }}
      />
    );
  }

  return (
    <img
      src={previewUrl ?? undefined}
      className={styles.inlineMediaThumb}
      alt={fileName || ""}
      draggable={false}
    />
  );
}

function InlineMediaPlaceholder({ isVideo, loading }: InlineMediaPlaceholderProps) {
  return (
    <div className={styles.inlineMediaPlaceholder}>
      {loading ? (
        <span className={styles.inlineMediaSpinner} aria-hidden="true" />
      ) : (
        <span className={styles.inlineMediaLock} aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none">
            <path d="M6.5 9V7a3.5 3.5 0 0 1 7 0v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <rect x="4.5" y="9" width="11" height="7.5" rx="2.2" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="10" cy="12.8" r="1.1" fill="currentColor" />
          </svg>
        </span>
      )}
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
  const { progress: uploadProgress, cancel: cancelUpload } = useUploadProgress(msg.id);

  // Plain attachments use the local blob URL directly — no decryption needed,
  // no "tap to unlock" gate. Bypass the hook's previewUrl gating completely.
  const plainLocalUrl = msg.attachment?.isPlain ? msg.attachment.localUrl ?? null : null;
  const previewUrl = plainLocalUrl ?? hookPreviewUrl;

  const isVideo = msg.attachment?.mimeType.startsWith("video/") ?? false;
  const messageTimeLabel = formatTime(msg.timestamp, locale);
  const error = resolveAttachmentErrorMessage("file", errorCause, t, !!msg.attachment?.isPlain);
  const mediaMetaOverlay = previewUrl ? (
    <div className={styles.inlineMediaMeta} aria-hidden="true">
      <span>{messageTimeLabel}</span>
      {isOwn ? <MessageStatusIcon status={msg.status} /> : null}
    </div>
  ) : null;

  useEffect(() => {
    // Plain attachments resolve their preview synchronously inside the runtime
    // hook; for E2EE we kick off decrypt-on-mount when the user opted in.
    // `errorCause` guard prevents an infinite retry loop when the fetch fails
    // (the effect would otherwise re-fire on the next render and hammer the
    // attachment endpoint until rate-limited).
    if (
      (autoDecryptMedia === "on" || !!msg.attachment?.isPlain) &&
      uploadProgress === null &&
      !previewUrl &&
      !loading &&
      !errorCause
    ) {
      void decryptAndPreview();
    }
  }, [autoDecryptMedia, decryptAndPreview, errorCause, loading, msg.attachment?.attachmentId, msg.attachment?.isPlain, previewUrl, uploadProgress]);

  const handleTap = async () => {
    if (uploadProgress !== null) return;
    if (previewUrl) {
      setLightboxOpen(true);
      return;
    }
    const url = await decryptAndPreview();
    if (url) setLightboxOpen(true);
  };

  return (
    <div className={`${styles.inlineMedia} ${isOwn ? styles.voiceOwn : styles.voiceTheirs}`}>
      <div className={styles.inlineMediaFrame}>
        <button
          type="button"
          className={styles.inlineMediaBtn}
          onClick={() => void handleTap()}
          disabled={uploadProgress !== null || (loading && !previewUrl)}
          aria-label={t(isVideo ? "message.media.tapToPlayVideo" : "message.media.tapToViewImage")}
        >
          {previewUrl ? (
            <InlineMediaPreview
              isVideo={isVideo}
              previewUrl={previewUrl}
              fileName={msg.attachment?.fileName}
            />
          ) : (
            <InlineMediaPlaceholder isVideo={isVideo} loading={loading} />
          )}

          {previewUrl && isVideo ? (
            <span className={styles.inlineMediaPlayOverlay} aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="11" fill="rgb(0 0 0 / 0.48)" />
                <path d="M10 8.5l6 3.5-6 3.5V8.5Z" fill="currentColor" />
              </svg>
            </span>
          ) : null}
        </button>

        {uploadProgress === null ? mediaMetaOverlay : (
          <InlineAttachmentUploadOverlay
            progress={uploadProgress}
            onCancel={cancelUpload}
            ariaLabel={t("message.upload.cancel")}
          />
        )}
      </div>

      {error ? <div className={styles.voiceError}>{error}</div> : null}

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

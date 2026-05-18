import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { useSecuritySettings } from "@/ui-settings";
import { useFileAttachmentRuntime } from "@/chats/runtime/useFileAttachmentRuntime";
import { useUploadProgress } from "@/chats/runtime/useUploadProgress";
import type { Message } from "@/stores/messages";
import { MessageStatusIcon } from "./MessageListAttachments";
import { InlineAttachmentUploadOverlay } from "./AttachmentUploadProgress";
import styles from "../MessageList.module.css";

/**
 * Resolved lightbox-ready preview payload for a single media-group cell.
 */
export interface CellPreviewData {
  url: string;
  mimeType: string;
  caption?: string;
  fileName?: string;
  onDownload: () => void;
  downloading: boolean;
}

/**
 * Imperative handle a cell exposes so the album can drive lightbox navigation
 * without re-rendering every sibling cell.
 */
export interface CellPreviewController {
  getPreviewData: () => CellPreviewData | null;
  ensurePreviewData: () => Promise<CellPreviewData | null>;
}

export interface MediaGroupCellProps {
  readonly msg: Message;
  readonly fallbackCaption: string | undefined;
  readonly isLast: boolean;
  readonly isOwn: boolean;
  readonly timeLabel: string;
  readonly onOpen: (messageId: string) => void;
  readonly onControllerUpdate: (messageId: string, controller: CellPreviewController | null) => void;
  readonly onAspectRatioUpdate: (messageId: string, ratio: number) => void;
}

/**
 * One album cell: owns its own decrypt/preview/upload runtime wiring and
 * publishes a preview controller upward. Presentation-only beyond the runtime
 * hooks it already depended on; album geometry lives in `media-group-layout.ts`.
 */
export function MediaGroupCell({
  msg,
  fallbackCaption,
  isLast,
  isOwn,
  timeLabel,
  onOpen,
  onControllerUpdate,
  onAspectRatioUpdate,
}: MediaGroupCellProps) {
  const { t } = useI18n();
  const { autoDecryptMedia } = useSecuritySettings();
  const {
    loading,
    previewUrl,
    decryptAndPreview,
    decryptAndDownload,
  } = useFileAttachmentRuntime({
    attachment: msg.attachment,
    messageId: msg.id,
  });
  const { progress: uploadProgress, cancel: cancelUpload } = useUploadProgress(msg.id);
  const isVideo = msg.attachment?.mimeType.startsWith("video/") ?? false;
  const [cellLoaded, setCellLoaded] = useState(false);
  const previewDataRef = useRef<CellPreviewData | null>(null);
  const previewMediaElement = isVideo ? (
    <video
      src={previewUrl ?? undefined}
      className={styles.mediaGroupThumb}
      muted
      playsInline
      preload="metadata"
      onLoadedMetadata={(e) => {
        if (e.currentTarget.videoWidth > 0 && e.currentTarget.videoHeight > 0) {
          onAspectRatioUpdate(msg.id, e.currentTarget.videoWidth / e.currentTarget.videoHeight);
        }
        e.currentTarget.currentTime = 0.001;
        setCellLoaded(true);
      }}
    />
  ) : (
    <img
      src={previewUrl ?? undefined}
      className={styles.mediaGroupThumb}
      alt={msg.attachment?.fileName || ""}
      draggable={false}
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth > 0 && e.currentTarget.naturalHeight > 0) {
          onAspectRatioUpdate(msg.id, e.currentTarget.naturalWidth / e.currentTarget.naturalHeight);
        }
        setCellLoaded(true);
      }}
    />
  );

  const buildPreviewData = useCallback((url: string, downloading: boolean): CellPreviewData => {
    const caption = msg.attachment?.caption?.trim()
      ? msg.attachment.caption
      : fallbackCaption;

    return {
      url,
      mimeType: msg.attachment?.mimeType ?? "",
      caption,
      fileName: msg.attachment?.fileName,
      onDownload: () => void decryptAndDownload(),
      downloading,
    };
  }, [
    decryptAndDownload,
    fallbackCaption,
    msg.attachment?.caption,
    msg.attachment?.fileName,
    msg.attachment?.mimeType,
  ]);

  useEffect(() => {
    previewDataRef.current = previewUrl
      ? buildPreviewData(previewUrl, loading)
      : null;
  }, [buildPreviewData, loading, previewUrl]);

  const getPreviewData = useCallback((): CellPreviewData | null => previewDataRef.current, []);

  const ensurePreviewData = useCallback(async (): Promise<CellPreviewData | null> => {
    if (uploadProgress !== null) return null;
    const existing = getPreviewData();
    if (existing) return existing;
    const url = await decryptAndPreview();
    if (!url) return null;
    const nextData = buildPreviewData(url, false);
    previewDataRef.current = nextData;
    return nextData;
  }, [
    buildPreviewData,
    decryptAndPreview,
    getPreviewData,
    uploadProgress,
  ]);

  useEffect(() => {
    if (
      autoDecryptMedia === "on" &&
      uploadProgress === null &&
      !previewUrl &&
      !loading
    ) {
      void decryptAndPreview();
    }
  }, [autoDecryptMedia, decryptAndPreview, loading, msg.attachment?.attachmentId, previewUrl, uploadProgress]);

  useEffect(() => {
    onControllerUpdate(msg.id, {
      getPreviewData,
      ensurePreviewData,
    });
    return () => {
      onControllerUpdate(msg.id, null);
    };
  }, [ensurePreviewData, getPreviewData, msg.id, onControllerUpdate]);

  const handleTap = async () => {
    const previewData = await ensurePreviewData();
    if (previewData) {
      onOpen(msg.id);
    }
  };

  // Badge only shown after the media element has loaded — prevents it from
  // appearing at the wrong position before the cell has its natural dimensions.
  const cellMetaOverlay = isLast && previewUrl && cellLoaded ? (
    <div className={styles.mediaGroupMeta} aria-hidden="true">
      <span>{timeLabel}</span>
      {isOwn ? <MessageStatusIcon status={msg.status} /> : null}
    </div>
  ) : null;

  return (
    <button
      type="button"
      className={styles.mediaGroupCell}
      tabIndex={uploadProgress === null ? 0 : -1}
      aria-disabled={uploadProgress !== null}
      aria-label={t(isVideo ? "message.media.tapToPlayVideo" : "message.media.tapToViewImage")}
      onClick={() => { if (uploadProgress === null) void handleTap(); }}
      onKeyDown={(e) => { if (uploadProgress === null && (e.key === "Enter" || e.key === " ")) void handleTap(); }}
    >
      {previewUrl ? (
        previewMediaElement
      ) : (
        <div className={styles.mediaGroupPlaceholder}>
          {loading ? (
            <span className={styles.mediaGroupSpinner} aria-hidden="true" />
          ) : (
            <span className={styles.inlineMediaLock} aria-hidden="true">
              <svg viewBox="0 0 20 20" fill="none">
                <path d="M6.5 9V7a3.5 3.5 0 0 1 7 0v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <rect x="4.5" y="9" width="11" height="7.5" rx="2.2" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.3" />
                <circle cx="10" cy="12.8" r="1.1" fill="currentColor" />
              </svg>
            </span>
          )}
        </div>
      )}

      {previewUrl && isVideo ? (
        <div className={styles.mediaGroupPlayOverlay} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="11" fill="rgb(0 0 0 / 0.48)" />
            <path d="M10 8.5l6 3.5-6 3.5V8.5Z" fill="currentColor" />
          </svg>
        </div>
      ) : null}

      {uploadProgress === null ? cellMetaOverlay : (
        <InlineAttachmentUploadOverlay
          progress={uploadProgress}
          onCancel={cancelUpload}
          ariaLabel={t("message.upload.cancel")}
        />
      )}
    </button>
  );
}

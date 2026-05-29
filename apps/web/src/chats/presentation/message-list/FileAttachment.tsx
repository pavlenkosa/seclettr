import type { CSSProperties } from "react";
import { useI18n } from "@/i18n";
import { useFileAttachmentRuntime } from "@/chats/runtime/useFileAttachmentRuntime";
import { useExitingUploadProgress } from "@/chats/runtime/useUploadProgress";
import { InlineNotice } from "@/components/ui";
import type { Message } from "@/stores/messages";
import { formatAttachmentSize, resolveAttachmentErrorMessage } from "./message-attachment-shared";
import styles from "./MessageListAttachments.module.css";

function FileDownloadActions({
  loading, downloaded, isPlain, error, msg, decryptAndDownload,
}: {
  loading: boolean;
  downloaded: boolean;
  isPlain: boolean;
  error: string | null;
  msg: Message;
  decryptAndDownload: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <button
        onClick={() => void decryptAndDownload()}
        disabled={loading || msg.status === "sending"}
        className={`${styles.fileDecryptBtn} ${msg.isOwn ? styles.fileDecryptBtnOwn : ""}`}
        aria-label={t(isPlain ? "message.file.downloadAria" : "message.file.decryptAria")}
      >
        {loading
          ? t(isPlain ? "message.file.downloading" : "message.file.decrypting")
          : downloaded
            ? t("message.file.downloadAgain")
            : isPlain
              ? t("message.file.download")
              : t("message.file.decryptAndDownload")}
      </button>
      {error ? (
        <InlineNotice tone="error" size="sm" role="alert" className={styles.attachmentErrorNotice}>
          {error}
        </InlineNotice>
      ) : null}
    </>
  );
}

/**
 * Generic encrypted file attachment block with decrypt-and-download action.
 */
export function FileAttachment({ msg }: { readonly msg: Message }) {
  const { t } = useI18n();
  const {
    loading,
    downloaded,
    errorCause,
    decryptAndDownload,
  } = useFileAttachmentRuntime({
    attachment: msg.attachment,
    messageId: msg.id,
  });
  const {
    displayProgress: progress,
    isExiting: uploadExiting,
    cancel,
  } = useExitingUploadProgress(msg.id);

  const isPlain = !!msg.attachment?.isPlain;
  const error = resolveAttachmentErrorMessage("file", errorCause, t, isPlain);
  const isUploading = progress !== null;
  const fallbackName = isPlain ? t("message.file.unnamedPlain") : t("message.file.unnamed");

  return (
    <div className={styles.fileAttachment}>
      <div className={styles.fileTitle}>{msg.attachment?.fileName || fallbackName}</div>
      <div className={styles.fileMeta}>
        <span>{formatAttachmentSize(msg.attachment?.size, t)}</span>
        {msg.attachment?.mimeType ? <span>{msg.attachment.mimeType}</span> : null}
      </div>
      {isUploading ? (
        <div
          className={styles.uploadProgress}
          style={uploadExiting ? { opacity: 0, transition: "opacity 220ms" } as CSSProperties : undefined}
        >
          <div className={styles.uploadProgressRow}>
            <span>{t("message.upload.uploading")}</span>
            <button
              type="button"
              className={styles.uploadCancelBtn}
              onClick={cancel}
              aria-label={t("message.upload.cancel")}
            >
              {t("message.upload.cancel")}
            </button>
          </div>
          <div className={styles.uploadProgressBar}>
            <div
              className={`${styles.uploadProgressFill} ${msg.isOwn ? styles.uploadProgressFillOwn : ""}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <FileDownloadActions
          loading={loading}
          downloaded={downloaded}
          isPlain={isPlain}
          error={error}
          msg={msg}
          decryptAndDownload={decryptAndDownload}
        />
      )}
    </div>
  );
}

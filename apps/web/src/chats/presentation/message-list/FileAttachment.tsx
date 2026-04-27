import { useI18n } from "@/i18n";
import { useFileAttachmentRuntime } from "@/chats/runtime/useFileAttachmentRuntime";
import { useUploadProgress } from "@/chats/runtime/useUploadProgress";
import type { Message } from "@/stores/messages";
import { formatAttachmentSize, resolveAttachmentErrorMessage } from "./message-attachment-shared";
import styles from "../MessageList.module.css";

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
  const { progress, cancel } = useUploadProgress(msg.id);

  const error = resolveAttachmentErrorMessage("file", errorCause, t);
  const isUploading = progress !== null;
  const downloadedLabel = downloaded ? t("message.file.downloadAgain") : t("message.file.decryptAndDownload");

  return (
    <div className={styles.fileAttachment}>
      <div className={styles.fileTitle}>{msg.attachment?.fileName || t("message.file.unnamed")}</div>
      <div className={styles.fileMeta}>
        <span>{formatAttachmentSize(msg.attachment?.size, t)}</span>
        {msg.attachment?.mimeType ? <span>{msg.attachment.mimeType}</span> : null}
      </div>
      {isUploading ? (
        <div className={styles.uploadProgress}>
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
              className={styles.uploadProgressFill}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={() => void decryptAndDownload()}
            disabled={loading || msg.status === "sending"}
            className={styles.fileDecryptBtn}
            aria-label={t("message.file.decryptAria")}
          >
            {loading
              ? t("message.file.decrypting")
              : downloadedLabel}
          </button>
          {error ? <div className={styles.voiceError}>{error}</div> : null}
        </>
      )}
    </div>
  );
}

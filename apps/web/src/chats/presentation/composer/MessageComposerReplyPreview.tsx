import { IconButton } from "@/components/ui";
import type { MessageReplyMeta } from "@/stores/messages";
import styles from "../MessageComposer.module.css";

type ReplyPreviewProps = Readonly<{
  replyTo?: MessageReplyMeta;
  onClearReply?: () => void;
  clearLabel: string;
}>;

export function ReplyPreview({
  replyTo,
  onClearReply,
  clearLabel,
}: ReplyPreviewProps) {
  if (!replyTo) {
    return null;
  }

  return (
    <div className={styles.replyPreview}>
      <div className={styles.replyPreviewContent}>
        {replyTo.senderName ? (
          <span className={styles.replyPreviewSender}>{replyTo.senderName}</span>
        ) : null}
        <span className={styles.replyPreviewText}>{replyTo.content}</span>
      </div>
      <IconButton
        size={22}
        variant="ghost"
        className={styles.replyPreviewClose}
        onClick={onClearReply}
        aria-label={clearLabel}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M2 2l8 8M10 2L2 10"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </IconButton>
    </div>
  );
}

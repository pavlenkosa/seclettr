import { memo, type ReactNode } from "react";
import { SurfacePanel } from "@/components/ui";
import { IconEncrypted, IconPinned } from "@/components/ui/icons";
import type { MessageListRowPresentation } from "./message-list-presentation";
import {
  FileAttachment,
  InlineMediaAttachment,
  MessageStatusIcon,
  VideoNoteAttachment,
  VoiceNoteAttachment,
} from "./MessageListAttachments";
import { MediaGroupAttachment } from "./MediaGroupAttachment";
import styles from "../MessageList.module.css";
import attachmentStyles from "./MessageListAttachments.module.css";

export type MessageListRowMessage = MessageListRowPresentation["message"];
export type MessageBodyKind = "voice" | "video" | "mediaGroup" | "media" | "file" | "text";

interface DateSeparatorProps {
  readonly presentation: MessageListRowPresentation;
}

interface CallEventRowProps {
  readonly presentation: MessageListRowPresentation;
}

interface SenderLabelProps {
  readonly presentation: MessageListRowPresentation;
  readonly message: MessageListRowMessage;
}

interface QuotedReplyProps {
  readonly message: MessageListRowMessage;
  readonly onScrollToMessage?: (messageId: string) => void;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

interface MessageBodyProps {
  readonly kind: MessageBodyKind;
  readonly presentation: MessageListRowPresentation;
  readonly activeMediaKey: string | null;
  readonly onActiveMediaChange: (next: string | null) => void;
}

interface AttachmentCaptionProps {
  readonly kind: MessageBodyKind;
  readonly presentation: MessageListRowPresentation;
}

interface MessageMetaProps {
  readonly message: MessageListRowMessage;
  readonly presentation: MessageListRowPresentation;
  readonly onRetry?: (messageId: string) => void;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

interface MessageBubbleProps {
  readonly presentation: MessageListRowPresentation;
  readonly kind: MessageBodyKind;
  readonly activeMediaKey: string | null;
  readonly onActiveMediaChange: (next: string | null) => void;
  readonly onRetry?: (messageId: string) => void;
  readonly onScrollToMessage?: (messageId: string) => void;
  readonly isHighlighted: boolean;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

interface MessageRowFrameProps {
  readonly presentation: MessageListRowPresentation;
  readonly children: ReactNode;
  readonly selectionMode?: boolean;
  readonly isSelected?: boolean;
  readonly onToggleSelect?: () => void;
}

export const DateSeparator = memo(function DateSeparator({ presentation }: DateSeparatorProps) {
  if (!presentation.showDateSeparator) return null;

  return (
    <div className={styles.dateSeparator} aria-hidden="true">
      <span className={styles.dateSeparatorLabel}>{presentation.dateSeparatorLabel}</span>
    </div>
  );
});

export const CallEventRow = memo(function CallEventRow({ presentation }: CallEventRowProps) {
  if (!presentation.callEvent) return null;

  return (
    <div className={styles.callEventRow}>
      <SurfacePanel className={styles.callEventCard} padding="none" radius="lg">
        <div className={styles.callEventTitle}>{presentation.callEvent.title}</div>
        <div className={styles.callEventMeta}>
          <span>{presentation.callEvent.meta}</span>
          <span>{presentation.timeLabel}</span>
        </div>
      </SurfacePanel>
    </div>
  );
});

export const SenderLabel = memo(function SenderLabel({ presentation, message }: SenderLabelProps) {
  return !message.isOwn && presentation.senderLabel
    ? <div className={styles.senderLabel}>{presentation.senderLabel}</div>
    : null;
});

export function EncryptedBadge({ ariaLabel }: { readonly ariaLabel: string }) {
  return <IconEncrypted className={styles.encryptedBadge} ariaLabel={ariaLabel} />;
}

export function PinnedBadge({ ariaLabel }: { readonly ariaLabel: string }) {
  return <IconPinned className={styles.pinBadge} ariaLabel={ariaLabel} />;
}

function resolveQuotedReplyText(content: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  if (content === "[voice note]") return t("conversation.voiceNotePreview");
  if (content === "[video note]") return t("conversation.videoNotePreview");
  if (content === "[attachment]") return t("conversation.attachmentPreview");
  if (content === "[invalid attachment]") return t("conversation.invalidAttachmentPreview");
  if (content === "[encrypted message]" || content === "[encrypted group message]") {
    return t("conversation.encryptedMessagePreview");
  }
  return content;
}

export function QuotedReply({
  message,
  onScrollToMessage,
  t,
}: QuotedReplyProps) {
  const reply = message.replyTo;
  const replyId = reply?.id;
  const canScrollToReply = Boolean(onScrollToMessage && replyId);

  if (!reply) return null;

  const quotedClassName = `${styles.quotedBubble} ${message.isOwn ? styles.quotedBubbleOwn : styles.quotedBubbleTheirs} ${canScrollToReply ? styles.quotedBubbleClickable : ""}`;
  const quotedText = resolveQuotedReplyText(reply.content, t);

  if (canScrollToReply && replyId) {
    return (
      <button
        type="button"
        className={quotedClassName}
        aria-label={t("message.context.scrollToReply")}
        onClick={() => onScrollToMessage?.(replyId)}
      >
        {reply.senderName ? (
          <span className={styles.quotedSender}>{reply.senderName}</span>
        ) : null}
        <span className={styles.quotedText}>{quotedText}</span>
      </button>
    );
  }

  return (
    <div className={quotedClassName}>
      {reply.senderName ? (
        <span className={styles.quotedSender}>{reply.senderName}</span>
      ) : null}
      <span className={styles.quotedText}>{quotedText}</span>
    </div>
  );
}

export function MessageBody({
  kind,
  presentation,
  activeMediaKey,
  onActiveMediaChange,
}: MessageBodyProps) {
  const { message } = presentation;

  if (kind === "voice") {
    return (
      <VoiceNoteAttachment
        msg={message}
        isOwn={message.isOwn}
        mediaKey={`voice:${message.id}`}
        activeMediaKey={activeMediaKey}
        onActiveMediaChange={onActiveMediaChange}
      />
    );
  }

  if (kind === "video") {
    return (
      <VideoNoteAttachment
        msg={message}
        isOwn={message.isOwn}
        mediaKey={`video:${message.id}`}
        activeMediaKey={activeMediaKey}
        onActiveMediaChange={onActiveMediaChange}
      />
    );
  }

  if (kind === "mediaGroup") {
    return (
      <MediaGroupAttachment
        messages={presentation.mediaGroupMessages ?? []}
        isOwn={message.isOwn}
        timeLabel={presentation.timeLabel}
      />
    );
  }

  if (kind === "media") {
    return <InlineMediaAttachment msg={message} isOwn={message.isOwn} />;
  }

  return kind === "file"
    ? <FileAttachment msg={message} />
    : <span className={styles.text}>{presentation.textPreview}</span>;
}

function resolveAttachmentCaption(
  kind: MessageBodyKind,
  presentation: MessageListRowPresentation
): string | null {
  if (kind === "text" || kind === "voice" || kind === "video") return null;

  const caption =
    kind === "mediaGroup"
      ? presentation.mediaGroupMessages?.find(
          (entry) => entry.attachment?.caption?.trim()
        )?.attachment?.caption
      : presentation.message.attachment?.caption;

  return caption?.trim() || null;
}

export function AttachmentCaption({
  kind,
  presentation,
}: AttachmentCaptionProps) {
  const caption = resolveAttachmentCaption(kind, presentation);
  return caption ? (
    <div className={attachmentStyles.attachmentCaption}>{caption}</div>
  ) : null;
}

export function MessageMeta({
  message,
  presentation,
  onRetry,
  t,
}: MessageMetaProps) {
  if (!message.isOwn) {
    return <span className={styles.time}>{presentation.timeLabel}</span>;
  }

  if (message.status === "error" && onRetry) {
    return (
      <>
        <span className={styles.time}>{presentation.timeLabel}</span>
        <button
          type="button"
          className={styles.retryBtn}
          onClick={() => onRetry(message.id)}
          title={t("conversation.retrySend")}
          aria-label={t("conversation.retrySend")}
        >
          <MessageStatusIcon status={message.status} />
        </button>
      </>
    );
  }

  return (
    <>
      <span className={styles.time}>{presentation.timeLabel}</span>
      <MessageStatusIcon status={message.status} />
    </>
  );
}

function buildBubbleClassName(message: MessageListRowMessage, kind: MessageBodyKind, isHighlighted: boolean): string {
  return [
    styles.bubble,
    message.isOwn ? styles.bubbleOwn : styles.bubbleTheirs,
    kind === "voice" ? styles.voiceBubble : "",
    kind === "media" || kind === "mediaGroup" ? attachmentStyles.mediaBubble : "",
    isHighlighted ? styles.bubbleHighlighted : "",
  ].join(" ");
}

export function MessageBubble({
  presentation,
  kind,
  activeMediaKey,
  onActiveMediaChange,
  onRetry,
  onScrollToMessage,
  isHighlighted,
  t,
}: MessageBubbleProps) {
  const { message } = presentation;
  const showMeta = kind !== "voice" && kind !== "video" && kind !== "media" && kind !== "mediaGroup";
  const bubbleClassName = buildBubbleClassName(message, kind, isHighlighted);

  return (
    <div className={bubbleClassName}>
      <SenderLabel presentation={presentation} message={message} />
      <QuotedReply message={message} onScrollToMessage={onScrollToMessage} t={t} />
      <MessageBody
        kind={kind}
        presentation={presentation}
        activeMediaKey={activeMediaKey}
        onActiveMediaChange={onActiveMediaChange}
      />
      <AttachmentCaption kind={kind} presentation={presentation} />
      {showMeta ? (
        <div className={styles.meta}>
          <MessageMeta message={message} presentation={presentation} onRetry={onRetry} t={t} />
        </div>
      ) : null}
    </div>
  );
}

export function MessageRowFrame({
  presentation,
  children,
  selectionMode,
  isSelected,
  onToggleSelect,
}: MessageRowFrameProps) {
  const rowClass = [
    styles.messageRow,
    presentation.message.isOwn ? styles.own : styles.theirs,
    selectionMode ? styles.messageRowSelectable : "",
    selectionMode && isSelected ? styles.messageRowSelected : "",
  ].join(" ");

  if (selectionMode) {
    return (
      <div
        className={rowClass}
        onClick={onToggleSelect}
        role="checkbox"
        aria-checked={!!isSelected}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            onToggleSelect?.();
          }
        }}
      >
        <span
          className={`${styles.selectionCircle} ${isSelected ? styles.selectionCircleChecked : ""}`}
          aria-hidden="true"
        >
          {isSelected && (
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
              <path d="M1.5 5.5l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        {children}
      </div>
    );
  }

  // role="article" lets screen-reader users navigate between messages using
  // article shortcuts (e.g. NVDA 'A' key) within the parent role="log".
  return <div role="article" className={rowClass}>{children}</div>;
}

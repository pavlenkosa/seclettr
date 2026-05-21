/**
 * MessageListRow — renders one projected chat timeline row.
 *
 * Owns:
 *   - Row-level rendering branches for text, file, inline media, albums,
 *     voice notes, video notes, and call events
 *   - Quoted-reply rendering and reply-jump affordance
 *   - Row-local context-menu capabilities (copy / reply / forward / delete)
 *   - Own-vs-peer bubble/meta presentation
 *
 * Does not own virtualization, row projection building, message-store updates,
 * or attachment/media runtime behavior.
 */
import { memo, useCallback, type CSSProperties, type ReactNode } from "react";
import { SurfacePanel } from "@/components/ui";
import { MessageContextMenu, type MessageContextMenuAction } from "../MessageContextMenu";
import {
  FileAttachment,
  InlineMediaAttachment,
  MessageStatusIcon,
  VideoNoteAttachment,
  VoiceNoteAttachment,
  isFileAttachment,
  isInlineMedia,
  isVideoNote,
  isVoiceNote,
} from "./MessageListAttachments";
import { MediaGroupAttachment } from "./MediaGroupAttachment";
import type { MessageListRowPresentation } from "./message-list-presentation";
import styles from "../MessageList.module.css";

interface Props {
  readonly presentation: MessageListRowPresentation;
  readonly activeMediaKey: string | null;
  readonly onActiveMediaChange: (next: string | null) => void;
  readonly onRetry?: (messageId: string) => void;
  readonly onReply?: (messageId: string) => void;
  /** Optional delete handler. When provided, the row exposes a Delete entry
   *  in its context menu (own messages only). */
  readonly onDelete?: (messageId: string) => void;
  /** Optional forward handler. When provided, exposes Forward in context menu. */
  readonly onForward?: (messageId: string) => void;
  readonly onScrollToMessage?: (messageId: string) => void;
  readonly isHighlighted: boolean;
  readonly enterDelayMs: number;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

type MessageListRowMessage = MessageListRowPresentation["message"];
type MessageBodyKind = "voice" | "video" | "mediaGroup" | "media" | "file" | "text";
type DateSeparatorProps = Readonly<{ presentation: MessageListRowPresentation }>;
type RowTimestampProps = Readonly<{ presentation: MessageListRowPresentation }>;
type CallEventRowProps = Readonly<{ presentation: MessageListRowPresentation }>;
type SenderLabelProps = Readonly<{
  presentation: MessageListRowPresentation;
  message: MessageListRowMessage;
}>;
type QuotedReplyProps = Readonly<{
  message: MessageListRowMessage;
  onScrollToMessage?: (messageId: string) => void;
  t: Props["t"];
}>;
type MessageBodyProps = Readonly<{
  kind: MessageBodyKind;
  presentation: MessageListRowPresentation;
  activeMediaKey: string | null;
  onActiveMediaChange: (next: string | null) => void;
}>;
type AttachmentCaptionProps = Readonly<{
  kind: MessageBodyKind;
  presentation: MessageListRowPresentation;
}>;
type MessageMetaProps = Readonly<{
  message: MessageListRowMessage;
  presentation: MessageListRowPresentation;
  onRetry?: (messageId: string) => void;
  t: Props["t"];
}>;
type MessageBubbleProps = Readonly<{
  presentation: MessageListRowPresentation;
  kind: MessageBodyKind;
  activeMediaKey: string | null;
  onActiveMediaChange: (next: string | null) => void;
  onRetry?: (messageId: string) => void;
  onScrollToMessage?: (messageId: string) => void;
  isHighlighted: boolean;
  t: Props["t"];
}>;
type MessageRowFrameProps = Readonly<{
  presentation: MessageListRowPresentation;
  children: ReactNode;
}>;
type MessageRowCapabilities = Readonly<{
  canCopy: boolean;
  canDelete: boolean;
  canForward: boolean;
}>;
type MessageRowContentProps = Readonly<{
  presentation: MessageListRowPresentation;
  kind: MessageBodyKind;
  capabilities: MessageRowCapabilities;
  activeMediaKey: string | null;
  onActiveMediaChange: (next: string | null) => void;
  onRetry?: (messageId: string) => void;
  onReply?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onForward?: (messageId: string) => void;
  onScrollToMessage?: (messageId: string) => void;
  isHighlighted: boolean;
  t: Props["t"];
}>;

function getMessageBodyKind(
  message: MessageListRowMessage,
  hasMediaGroup: boolean
): MessageBodyKind {
  if (isVoiceNote(message)) return "voice";
  if (isVideoNote(message)) return "video";
  if (hasMediaGroup) return "mediaGroup";
  if (isInlineMedia(message)) return "media";
  if (isFileAttachment(message)) return "file";
  return "text";
}

function usesInlineAttachmentMeta(kind: MessageBodyKind): boolean {
  return kind === "voice" || kind === "video" || kind === "media" || kind === "mediaGroup";
}

function canCopyMessage(message: MessageListRowMessage, kind: MessageBodyKind): boolean {
  return kind === "text" && Boolean(message.content) && !message.content.startsWith("[");
}

function resolveMessageRowCapabilities(
  message: MessageListRowMessage,
  kind: MessageBodyKind,
  handlers: Pick<Props, "onDelete" | "onForward">
): MessageRowCapabilities {
  return {
    canCopy: canCopyMessage(message, kind),
    // Delete is offered when the row owns a delete handler AND the message is
    // own (sender). The store / API enforces the actual permission server-side.
    canDelete: Boolean(handlers.onDelete) && message.isOwn,
    canForward: Boolean(handlers.onForward)
      && kind === "text"
      && Boolean(message.content)
      && !message.content.startsWith("["),
  };
}

function resolveAttachmentCaption({
  kind,
  presentation,
}: AttachmentCaptionProps): string | null {
  if (kind === "text" || kind === "voice" || kind === "video") {
    return null;
  }

  const caption =
    kind === "mediaGroup"
      ? presentation.mediaGroupMessages?.find(
          (entry) => entry.attachment?.caption?.trim()
        )?.attachment?.caption
      : presentation.message.attachment?.caption;

  return caption?.trim() || null;
}

function DateSeparator({ presentation }: DateSeparatorProps) {
  if (!presentation.showDateSeparator) {
    return null;
  }

  return (
    <div className={styles.dateSeparator} aria-hidden="true">
      <span className={styles.dateSeparatorLabel}>{presentation.dateSeparatorLabel}</span>
    </div>
  );
}

function RowTimestamp({ presentation }: RowTimestampProps) {
  return presentation.showTimestamp
    ? <div className={styles.timestamp}>{presentation.timeLabel}</div>
    : null;
}

function CallEventRow({ presentation }: CallEventRowProps) {
  if (!presentation.callEvent) {
    return null;
  }

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
}

function SenderLabel({ presentation, message }: SenderLabelProps) {
  return !message.isOwn && presentation.senderLabel
    ? <div className={styles.senderLabel}>{presentation.senderLabel}</div>
    : null;
}

function resolveQuotedReplyText(content: string, t: Props["t"]): string {
  if (content === "[voice note]") return t("conversation.voiceNotePreview");
  if (content === "[video note]") return t("conversation.videoNotePreview");
  if (content === "[attachment]") return t("conversation.attachmentPreview");
  if (content === "[invalid attachment]") return t("conversation.invalidAttachmentPreview");
  if (content === "[encrypted message]" || content === "[encrypted group message]") {
    return t("conversation.encryptedMessagePreview");
  }

  return content;
}

function QuotedReply({
  message,
  onScrollToMessage,
  t,
}: QuotedReplyProps) {
  const reply = message.replyTo;
  const replyId = reply?.id;
  const canScrollToReply = Boolean(onScrollToMessage && replyId);

  if (!reply) {
    return null;
  }

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

function MessageBody({
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

function AttachmentCaption({
  kind,
  presentation,
}: AttachmentCaptionProps) {
  const caption = resolveAttachmentCaption({ kind, presentation });
  return caption ? (
    <div className={styles.attachmentCaption}>{caption}</div>
  ) : null;
}

function MessageMeta({
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

function MessageBubble({
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
  const showMeta = !usesInlineAttachmentMeta(kind);
  const bubbleClassName = [
    styles.bubble,
    message.isOwn ? styles.bubbleOwn : styles.bubbleTheirs,
    kind === "voice" ? styles.voiceBubble : "",
    kind === "media" || kind === "mediaGroup" ? styles.mediaBubble : "",
    isHighlighted ? styles.bubbleHighlighted : "",
  ].join(" ");

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

function MessageRowFrame({
  presentation,
  children,
}: MessageRowFrameProps) {
  return (
    <div className={`${styles.messageRow} ${presentation.message.isOwn ? styles.own : styles.theirs}`}>
      {children}
    </div>
  );
}

function MessageRowContent({
  presentation,
  kind,
  capabilities,
  activeMediaKey,
  onActiveMediaChange,
  onRetry,
  onReply,
  onDelete,
  onForward,
  onScrollToMessage,
  isHighlighted,
  t,
}: MessageRowContentProps) {
  const { message } = presentation;

  const handleContextAction = useCallback((action: MessageContextMenuAction) => {
    if (action.kind === "reply") {
      onReply?.(message.id);
      return;
    }

    if (action.kind === "forward") {
      onForward?.(message.id);
      return;
    }

    if (action.kind === "delete") {
      onDelete?.(message.id);
    }
  }, [message.id, onDelete, onForward, onReply]);

  if (presentation.callEvent) {
    return <CallEventRow presentation={presentation} />;
  }

  return (
    <MessageContextMenu
      onAction={handleContextAction}
      canCopy={capabilities.canCopy}
      canForward={capabilities.canForward}
      canDelete={capabilities.canDelete}
      copyText={capabilities.canCopy ? (message.content ?? undefined) : undefined}
    >
      <MessageRowFrame presentation={presentation}>
        <MessageBubble
          presentation={presentation}
          kind={kind}
          activeMediaKey={activeMediaKey}
          onActiveMediaChange={onActiveMediaChange}
          onRetry={onRetry}
          onScrollToMessage={onScrollToMessage}
          isHighlighted={isHighlighted}
          t={t}
        />
      </MessageRowFrame>
    </MessageContextMenu>
  );
}

export const MessageListRow = memo(function MessageListRow({
  presentation,
  activeMediaKey,
  onActiveMediaChange,
  onRetry,
  onReply,
  onDelete,
  onForward,
  onScrollToMessage,
  isHighlighted,
  enterDelayMs,
  t,
}: Props) {
  const { message } = presentation;
  const hasMediaGroup = (presentation.mediaGroupMessages?.length ?? 0) > 1;
  const kind = getMessageBodyKind(message, hasMediaGroup);
  const capabilities = resolveMessageRowCapabilities(message, kind, { onDelete, onForward });
  const entryStyle = {
    "--message-enter-delay": `${Math.min(enterDelayMs, 160)}ms`,
  } as CSSProperties;

  return (
    <div style={entryStyle}>
      <DateSeparator presentation={presentation} />
      <MessageRowContent
        presentation={presentation}
        kind={kind}
        capabilities={capabilities}
        activeMediaKey={activeMediaKey}
        onActiveMediaChange={onActiveMediaChange}
        onRetry={onRetry}
        onReply={onReply}
        onDelete={onDelete}
        onForward={onForward}
        onScrollToMessage={onScrollToMessage}
        isHighlighted={isHighlighted}
        t={t}
      />
    </div>
  );
}, (prev, next) => {
  return (
    prev.presentation === next.presentation &&
    prev.activeMediaKey === next.activeMediaKey &&
    prev.onRetry === next.onRetry &&
    prev.onReply === next.onReply &&
    prev.onDelete === next.onDelete &&
    prev.onForward === next.onForward &&
    prev.onScrollToMessage === next.onScrollToMessage &&
    prev.isHighlighted === next.isHighlighted &&
    prev.enterDelayMs === next.enterDelayMs &&
    prev.t === next.t
  );
});

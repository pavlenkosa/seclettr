import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { measureElement, useVirtualizer } from "@tanstack/react-virtual";
import { useI18n } from "@/i18n";
import { SeclettrMark } from "@/components/common/SeclettrMark";
import type { Message } from "@/stores/messages";
import { MessageListRow } from "./message-list/MessageListRow";
import {
  buildMessageRowPresentationState,
  type MessageRowPresentationCache,
} from "./message-list/message-list-presentation";
import { useMessageListTimelineState } from "./message-list/useMessageListTimelineState";
import styles from "./MessageList.module.css";

/**
 * Props for the message timeline view.
 */
interface Props {
  readonly messages: Message[];
  readonly senderLabels?: Record<string, string>;
  readonly onRetry?: (messageId: string) => void;
  readonly onReply?: (messageId: string) => void;
  readonly onDelete?: (messageId: string) => void;
  readonly onForward?: (messageId: string) => void;
  readonly onScrollToMessage?: (messageId: string) => void;
  readonly highlightMessageId?: string;
  readonly isTyping?: boolean;
  readonly onJumpToBottomStateChange?: (state: MessageListJumpToBottomState) => void;
  /** When true, renders a placeholder skeleton instead of the empty state
   *  while the thread's first-page history is being fetched. */
  readonly isLoadingHistory?: boolean;
}

export interface MessageListHandle {
  scrollToBottom: () => void;
}

export interface MessageListJumpToBottomState {
  visible: boolean;
  pendingCount: number;
}

const VIRTUALIZE_THRESHOLD = 80;

function resolveRowActiveMediaKey(
  messageIds: readonly string[],
  activeMediaKey: string | null
): string | null {
  if (!activeMediaKey) return null;
  return messageIds.some(
    (messageId) => activeMediaKey === `voice:${messageId}` || activeMediaKey === `video:${messageId}`
  )
    ? activeMediaKey
    : null;
}

export const MessageList = forwardRef<MessageListHandle, Props>(function MessageList({
  messages,
  senderLabels,
  onRetry,
  onReply,
  onDelete,
  onForward,
  onScrollToMessage,
  highlightMessageId,
  isTyping,
  onJumpToBottomStateChange,
  isLoadingHistory,
}, ref) {
  const { t, locale } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const rowPresentationCacheRef = useRef<MessageRowPresentationCache | null>(null);
  const shouldVirtualize = messages.length > VIRTUALIZE_THRESHOLD;

  const rowPresentationState = useMemo(() => buildMessageRowPresentationState({
    messages,
    senderLabels,
    locale,
    t,
    previousState: rowPresentationCacheRef.current,
  }), [locale, messages, senderLabels, t]);
  const rowPresentations = rowPresentationState.rows;
  const rowIndexByMessageId = rowPresentationState.rowIndexByMessageId;
  const rowIdByMessageId = rowPresentationState.rowIdByMessageId;

  useEffect(() => {
    rowPresentationCacheRef.current = rowPresentationState;
  }, [rowPresentationState]);

  const highlightRowIndex = highlightMessageId
    ? rowIndexByMessageId.get(highlightMessageId) ?? -1
    : -1;
  const highlightedRowIdFallback = highlightRowIndex >= 0
    ? rowPresentations[highlightRowIndex]?.rowId ?? null
    : null;
  const highlightedRowId = highlightMessageId
    ? rowIdByMessageId.get(highlightMessageId) ?? null
    : highlightedRowIdFallback;

  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? rowPresentations.length : 0,
    getScrollElement: () => containerRef.current,
    getItemKey: (index) => rowPresentations[index]?.rowId ?? index,
    estimateSize: () => 110,
    measureElement,
    overscan: 8,
  });

  const timelineState = useMessageListTimelineState({
    messages,
    rowCount: rowPresentations.length,
    highlightMessageId,
    highlightRowIndex,
    shouldVirtualize,
    virtualizer,
    onJumpToBottomStateChange,
    containerRef,
    bottomRef,
  });

  useImperativeHandle(ref, () => ({
    scrollToBottom: timelineState.scrollToBottom,
  }), [timelineState.scrollToBottom]);

  if (messages.length === 0) {
    if (isLoadingHistory) {
      // Hand-crafted skeleton with alternating own/peer bubbles of varying
      // widths so the thread doesn't pop from "Welcome / start a conversation"
      // straight to a populated list when history finally arrives.
      return (
        <div
          ref={timelineState.containerRef}
          className={styles.container}
          data-testid="chat-message-list-skeleton"
          aria-busy="true"
          aria-label={t("message.messagesLoadingAria")}
        >
          <div className={styles.skeletonStack} aria-hidden="true">
            {[
              { own: false, width: 62 },
              { own: true, width: 48 },
              { own: false, width: 78 },
              { own: false, width: 36 },
              { own: true, width: 56 },
              { own: true, width: 70 },
              { own: false, width: 42 },
            ].map((item, idx) => (
              <div
                key={idx}
                className={`${styles.skeletonRow} ${item.own ? styles.skeletonRowOwn : styles.skeletonRowPeer}`}
              >
                <div
                  className={styles.skeletonBubble}
                  style={{ width: `${item.width}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div
        ref={timelineState.containerRef}
        className={styles.container}
        data-testid="chat-message-list"
        role="log"
        aria-live="polite"
        aria-label={t("message.messagesAria")}
      >
        <div className={styles.empty}>
          <span className={styles.emptyMark} aria-hidden="true">
            <SeclettrMark decorative />
          </span>
          <p>
            {t("message.empty.line1")}
            <br />
            {t("message.empty.line2")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={timelineState.containerRef}
      className={styles.container}
      data-testid="chat-message-list"
      role="log"
      aria-live="polite"
      aria-label={t("message.messagesAria")}
    >
      {shouldVirtualize ? (
        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative", width: "100%" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const presentation = rowPresentations[virtualRow.index];
            if (!presentation) return null;

            return (
              <div
                key={presentation.rowId}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                data-rowid={presentation.rowId}
                data-testid={`message-row:${presentation.rowId}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {presentation.messageIds.map((messageId) => (
                  <span
                    key={messageId}
                    data-mid={messageId}
                    className={styles.messageAnchor}
                    aria-hidden="true"
                  />
                ))}
                <MessageListRow
                  presentation={presentation}
                  t={t}
                  activeMediaKey={resolveRowActiveMediaKey(presentation.messageIds, timelineState.activeMediaKey)}
                  onActiveMediaChange={timelineState.handleActiveMediaChange}
                  onRetry={onRetry}
                  onReply={onReply}
                  onDelete={onDelete}
                  onForward={onForward}
                  onScrollToMessage={onScrollToMessage}
                  isHighlighted={presentation.rowId === highlightedRowId}
                  enterDelayMs={Math.min(virtualRow.index, 8) * 22}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className={styles.spacer} />
          {rowPresentations.map((presentation, index) => {
            return (
              <div
                key={presentation.rowId}
                data-rowid={presentation.rowId}
                data-testid={`message-row:${presentation.rowId}`}
              >
                {presentation.messageIds.map((messageId) => (
                  <span
                    key={messageId}
                    data-mid={messageId}
                    className={styles.messageAnchor}
                    aria-hidden="true"
                  />
                ))}
                <MessageListRow
                  presentation={presentation}
                  t={t}
                  activeMediaKey={resolveRowActiveMediaKey(presentation.messageIds, timelineState.activeMediaKey)}
                  onActiveMediaChange={timelineState.handleActiveMediaChange}
                  onRetry={onRetry}
                  onReply={onReply}
                  onDelete={onDelete}
                  onForward={onForward}
                  onScrollToMessage={onScrollToMessage}
                  isHighlighted={presentation.rowId === highlightedRowId}
                  enterDelayMs={Math.min(index, 8) * 22}
                />
              </div>
            );
          })}
          <div ref={timelineState.bottomRef} />
        </>
      )}

      {isTyping && (
        <div className={styles.typingBubble} aria-live="polite" aria-label="typing">
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
        </div>
      )}
    </div>
  );
});

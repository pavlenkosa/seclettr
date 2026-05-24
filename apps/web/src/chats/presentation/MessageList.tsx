import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
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
  /** Bulk delete handler. When provided, bulk selection becomes available. */
  readonly onBulkDelete?: (messageIds: string[]) => void;
  /** Bulk forward handler. When provided, bulk forward is shown in the selection bar. */
  readonly onBulkForward?: (messageIds: string[]) => void;
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
  onBulkDelete,
  onBulkForward,
}, ref) {
  const { t, locale } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Bulk selection state ─────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  const handleEnterSelectionMode = useCallback((messageId: string) => {
    setSelectionMode(true);
    setSelectedIds(new Set([messageId]));
  }, []);

  const handleToggleSelect = useCallback((messageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  const handleExitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    onBulkDelete?.([...selectedIds]);
    handleExitSelection();
  }, [selectedIds, onBulkDelete, handleExitSelection]);

  const handleBulkForward = useCallback(() => {
    if (selectedIds.size === 0) return;
    onBulkForward?.([...selectedIds]);
    handleExitSelection();
  }, [selectedIds, onBulkForward, handleExitSelection]);
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

  const canEnterSelection = Boolean(onBulkDelete || onBulkForward);

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
            const leadId = presentation.messageIds[0];

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
                  selectionMode={selectionMode}
                  isSelected={leadId !== undefined && selectedIds.has(leadId)}
                  onToggleSelect={canEnterSelection ? handleToggleSelect : undefined}
                  onEnterSelectionMode={canEnterSelection ? handleEnterSelectionMode : undefined}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className={styles.spacer} />
          {rowPresentations.map((presentation, index) => {
            const leadId = presentation.messageIds[0];
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
                  selectionMode={selectionMode}
                  isSelected={leadId !== undefined && selectedIds.has(leadId)}
                  onToggleSelect={canEnterSelection ? handleToggleSelect : undefined}
                  onEnterSelectionMode={canEnterSelection ? handleEnterSelectionMode : undefined}
                />
              </div>
            );
          })}
          <div ref={timelineState.bottomRef} />
        </>
      )}

      {isTyping && !selectionMode && (
        <div className={styles.typingBubble} aria-live="polite" aria-label="typing">
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
          <span className={styles.typingDot} />
        </div>
      )}

      {selectionMode && (
        <div className={styles.bulkActionBar} role="toolbar" aria-label={t("message.bulkAction.selected", { count: selectedIds.size })}>
          <span className={styles.bulkActionCount}>
            {t("message.bulkAction.selected", { count: selectedIds.size })}
          </span>
          {onBulkForward && (
            <button
              type="button"
              className={styles.bulkBtn}
              disabled={selectedIds.size === 0}
              onClick={handleBulkForward}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M15 8l-5-5v3C5.5 6 2.5 8 1.5 12.5 3 10 5.5 9 10 9v3l5-4z" fill="currentColor" />
              </svg>
              {t("message.bulkAction.forward")}
            </button>
          )}
          {onBulkDelete && (
            <button
              type="button"
              className={`${styles.bulkBtn} ${styles.bulkBtnDanger}`}
              disabled={selectedIds.size === 0}
              onClick={handleBulkDelete}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 4h10M6 4V2.7a.7.7 0 0 1 .7-.7h2.6a.7.7 0 0 1 .7.7V4M5 4l.7 9.3a.7.7 0 0 0 .7.7h3.2a.7.7 0 0 0 .7-.7L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t("message.bulkAction.delete")}
            </button>
          )}
          <button
            type="button"
            className={`${styles.bulkBtn} ${styles.bulkBtnCancel}`}
            onClick={handleExitSelection}
          >
            {t("message.bulkAction.cancel")}
          </button>
        </div>
      )}
    </div>
  );
});

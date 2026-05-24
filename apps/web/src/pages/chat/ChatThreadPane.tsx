import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useI18n } from "@/i18n";
import type { Message } from "@/stores/messages";
import {
  MessageList,
  type MessageListHandle,
  type MessageListJumpToBottomState,
} from "@/chats/presentation/MessageList";
import { SeclettrMark } from "@/components/common/SeclettrMark";
import { IconButton, SurfacePanel } from "@/components/ui";
import styles from "./ChatThreadPane.module.css";

/**
 * Shared thread surface used by both desktop and mobile chat layouts.
 * Keeps message timeline and composer ownership out of `ChatPage`.
 */
export interface ChatThreadPaneProps {
  readonly hasActiveThread: boolean;
  readonly threadKey?: string;
  readonly messages: Message[];
  /** True while the thread's first-page history is still being fetched. */
  readonly isLoadingHistory?: boolean;
  readonly senderLabels?: Record<string, string>;
  readonly topChrome?: ReactNode;
  readonly composer?: ReactNode;
  readonly searchBar?: ReactNode;
  readonly mediaPanel?: ReactNode;
  readonly highlightMessageId?: string;
  readonly isTyping?: boolean;
  readonly onRetry?: (messageId: string) => void;
  readonly onReply?: (messageId: string) => void;
  readonly onDelete?: (messageId: string) => void;
  readonly onForward?: (messageId: string) => void;
  readonly onBulkDelete?: (messageIds: string[]) => void;
  readonly onBulkForward?: (messageIds: string[]) => void;
  readonly onScrollToMessage?: (messageId: string) => void;
  readonly onDropFiles?: (files: File[]) => Promise<void>;
}

type BulkSelectionState = { mode: boolean; selectedIds: ReadonlySet<string> };

export function ChatThreadPane({
  hasActiveThread,
  threadKey,
  messages,
  isLoadingHistory,
  senderLabels,
  topChrome,
  composer,
  searchBar,
  mediaPanel,
  highlightMessageId,
  isTyping,
  onRetry,
  onReply,
  onDelete,
  onForward,
  onBulkDelete,
  onBulkForward,
  onScrollToMessage,
  onDropFiles,
}: ChatThreadPaneProps) {
  const { t } = useI18n();
  const messageListRef = useRef<MessageListHandle>(null);
  const [jumpToBottomState, setJumpToBottomState] = useState<MessageListJumpToBottomState>({
    visible: false,
    pendingCount: 0,
  });
  const [isDragOver, setIsDragOver] = useState(false);
  const [bulkState, setBulkState] = useState<BulkSelectionState>({ mode: false, selectedIds: new Set() });

  useEffect(() => {
    setJumpToBottomState({
      visible: false,
      pendingCount: 0,
    });
  }, [hasActiveThread, threadKey]);

  const handleJumpToBottom = useCallback(() => {
    messageListRef.current?.scrollToBottom();
  }, []);

  const handleSelectionChange = useCallback((state: BulkSelectionState) => {
    setBulkState(state);
  }, []);

  const handleBulkCancel = useCallback(() => {
    messageListRef.current?.exitSelection();
  }, []);

  const handleBulkForward = useCallback(() => {
    if (bulkState.selectedIds.size === 0) return;
    onBulkForward?.([...bulkState.selectedIds]);
    messageListRef.current?.exitSelection();
  }, [bulkState.selectedIds, onBulkForward]);

  const handleBulkDelete = useCallback(() => {
    if (bulkState.selectedIds.size === 0) return;
    onBulkDelete?.([...bulkState.selectedIds]);
    messageListRef.current?.exitSelection();
  }, [bulkState.selectedIds, onBulkDelete]);

  const jumpBadgeLabel = jumpToBottomState.pendingCount > 99
    ? "99+"
    : String(jumpToBottomState.pendingCount);
  const jumpAriaLabel = jumpToBottomState.pendingCount > 0
    ? t("message.jumpToBottomNew", { count: jumpToBottomState.pendingCount })
    : t("message.jumpToBottom");

  const handleDragOver = useCallback((e: DragEvent<HTMLElement>) => {
    if (!onDropFiles) return;
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }, [onDropFiles]);

  const handleDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!onDropFiles) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) await onDropFiles(files);
  }, [onDropFiles]);

  if (!hasActiveThread) {
    return (
      <div className={styles.thread} data-testid="chat-thread-pane">
        <SurfacePanel className={styles.empty} padding="lg" radius="md">
          <span className={styles.emptyMark} aria-hidden="true">
            <SeclettrMark decorative />
          </span>
          <p>{t("chat.emptyState")}</p>
        </SurfacePanel>
      </div>
    );
  }

  const showBulkBar = bulkState.mode && (onBulkDelete || onBulkForward);

  return (
    <section
      className={styles.thread}
      data-testid="chat-thread-pane"
      aria-label={t("chat.dropFiles")}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => { void handleDrop(e); }}
    >
      {isDragOver ? (
        <div className={styles.dropOverlay} aria-hidden="true">
          <span className={styles.dropOverlayLabel}>{t("chat.dropFiles")}</span>
        </div>
      ) : null}
      <div className={styles.messagesArea}>
        {topChrome ? (
          <div className={styles.chromeRail}>
            {topChrome}
          </div>
        ) : null}
        {searchBar}
        <div className={styles.contentStack}>
          <div className={styles.messages}>
            <MessageList
              key={threadKey ?? "chat-thread"}
              ref={messageListRef}
              messages={messages}
              isLoadingHistory={isLoadingHistory}
              senderLabels={senderLabels}
              onRetry={onRetry}
              onReply={onReply}
              onDelete={onDelete}
              onForward={onForward}
              onSelectionChange={handleSelectionChange}
              onScrollToMessage={onScrollToMessage}
              highlightMessageId={highlightMessageId}
              isTyping={isTyping}
              onJumpToBottomStateChange={setJumpToBottomState}
            />
            {jumpToBottomState.visible ? (
              <IconButton
                size={38}
                className={`${styles.jumpToBottom} ${styles.jumpToBottomVisible}`}
                onClick={handleJumpToBottom}
                aria-label={jumpAriaLabel}
                title={jumpAriaLabel}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 3v9M3.5 8l4.5 4.5L12.5 8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span
                  className={`${styles.jumpToBottomBadge} ${jumpToBottomState.pendingCount > 0 ? styles.jumpToBottomBadgeVisible : ""}`}
                  aria-hidden="true"
                >
                  {jumpBadgeLabel}
                </span>
              </IconButton>
            ) : null}
          </div>
          {showBulkBar ? (
            <div
              className={styles.bulkActionBar}
              role="toolbar"
              aria-label={t("message.bulkAction.selected", { count: bulkState.selectedIds.size })}
            >
              <span className={styles.bulkActionCount}>
                {t("message.bulkAction.selected", { count: bulkState.selectedIds.size })}
              </span>
              {onBulkForward && (
                <button
                  type="button"
                  className={styles.bulkBtn}
                  disabled={bulkState.selectedIds.size === 0}
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
                  disabled={bulkState.selectedIds.size === 0}
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
                onClick={handleBulkCancel}
              >
                {t("message.bulkAction.cancel")}
              </button>
            </div>
          ) : null}
          {composer ? (
            <div className={styles.composerRail}>
              {composer}
            </div>
          ) : null}
          {mediaPanel}
        </div>
      </div>
    </section>
  );
}

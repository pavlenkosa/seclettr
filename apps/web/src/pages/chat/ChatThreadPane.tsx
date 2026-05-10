import { useCallback, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useI18n } from "@/i18n";
import type { Message } from "@/stores/messages";
import {
  MessageList,
  type MessageListHandle,
  type MessageListJumpToBottomState,
} from "@/chats/presentation/MessageList";
import { SeclettrMark } from "@/components/common/SeclettrMark";
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
  readonly onScrollToMessage?: (messageId: string) => void;
  readonly onDropFiles?: (files: File[]) => Promise<void>;
}

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

  useEffect(() => {
    setJumpToBottomState({
      visible: false,
      pendingCount: 0,
    });
  }, [hasActiveThread, threadKey]);

  const handleJumpToBottom = useCallback(() => {
    messageListRef.current?.scrollToBottom();
  }, []);

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
        <div className={styles.empty}>
          <span className={styles.emptyMark} aria-hidden="true">
            <SeclettrMark decorative />
          </span>
          <p>{t("chat.emptyState")}</p>
        </div>
      </div>
    );
  }

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
              onScrollToMessage={onScrollToMessage}
              highlightMessageId={highlightMessageId}
              isTyping={isTyping}
              onJumpToBottomStateChange={setJumpToBottomState}
            />
            {jumpToBottomState.visible ? (
              <button
                type="button"
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
              </button>
            ) : null}
          </div>
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

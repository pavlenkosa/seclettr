import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import { Avatar, MessageDeliveryStatusIcon, type MessageDeliveryStatus } from "@/components/ui";

import styles from "../ConversationList.module.css";
import { ConversationListPinMenu } from "./ConversationListPinMenu";
import {
  formatTime,
  getPreviewText,
  type ConversationEntry,
  type ConversationSelection,
  type EntryLastMessage,
  type PreviewStatus,
} from "./conversation-list-helpers";

const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_TOLERANCE_PX = 6;

interface ConversationListRowProps {
  readonly entry: ConversationEntry;
  readonly isActive: boolean;
  readonly locale: string;
  readonly nowMs: number;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
  readonly onSelect: (selection: ConversationSelection) => void;
  readonly onTogglePin: (entry: ConversationEntry) => void;
  readonly enterDelayMs: number;
}

export const ConversationListRow = memo(function ConversationListRow({
  entry,
  isActive,
  locale,
  nowMs,
  t,
  onSelect,
  onTogglePin,
  enterDelayMs,
}: ConversationListRowProps) {
  const last = entry.lastMessage;
  const previewText = getPreviewText(last, t);
  const showOwnPrefix = Boolean(last?.isOwn && last.type !== "call");
  const isGroup = entry.kind === "group" || entry.kind === "plain-group";
  const senderPrefix = last && !last.isOwn && isGroup && last.senderLabel
    ? `${last.senderLabel}: `
    : "";
  const itemStyle = {
    "--conversation-enter-delay": `${enterDelayMs}ms`,
  } as CSSProperties;
  const [menuOpen, setMenuOpen] = useState(false);
  const canPin = !!entry.pinKind;
  const pressStateRef = useRef<{ id: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);

  const cancelPress = useCallback(() => {
    if (pressStateRef.current) {
      clearTimeout(pressStateRef.current.id);
      pressStateRef.current = null;
    }
  }, []);

  const startPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canPin || event.pointerType !== "touch") return;
    cancelPress();
    pressStateRef.current = {
      id: setTimeout(() => {
        setMenuOpen(true);
        pressStateRef.current = null;
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          try { navigator.vibrate(8); } catch { /* ignore */ }
        }
      }, LONG_PRESS_MS),
      x: event.clientX,
      y: event.clientY,
    };
  };

  const movePress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const press = pressStateRef.current;
    if (!press) return;
    if (
      Math.abs(event.clientX - press.x) > LONG_PRESS_MOVE_TOLERANCE_PX ||
      Math.abs(event.clientY - press.y) > LONG_PRESS_MOVE_TOLERANCE_PX
    ) {
      cancelPress();
    }
  };

  useEffect(() => () => cancelPress(), [cancelPress]);

  const handleContextMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!canPin) return;
    event.preventDefault();
    setMenuOpen(true);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    globalThis.addEventListener("click", close);
    globalThis.addEventListener("keydown", onKey);
    return () => {
      globalThis.removeEventListener("click", close);
      globalThis.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <li className={styles.itemWrap}>
      <button
        className={`${styles.item} ${isActive ? styles.active : ""} ${entry.unreadCount > 0 ? styles.itemUnread : ""}`}
        style={itemStyle}
        onClick={() => onSelect({ kind: entry.kind, id: entry.id })}
        onContextMenu={handleContextMenu}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerMove={movePress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        data-testid={`conversation-entry:${entry.kind}:${entry.id}`}
        aria-current={isActive ? "true" : undefined}
      >
        {entry.kind === "saved"
          ? <SavedAvatar />
          : <Avatar label={entry.name} size={50} fontSize="0.9rem" ariaHidden />}

        <div className={styles.content}>
          <div className={styles.row}>
            <span className={styles.name}>
              {entry.name}
              {entry.isEncrypted ? <EncryptedBadge ariaLabel={t("conversation.encryptedBadgeAria")} /> : null}
              {entry.pinnedAt ? <PinnedBadge ariaLabel={t("conversation.pinnedBadgeAria")} /> : null}
            </span>
            {entry.lastMessageAt > 0 ? (
              <span className={styles.time}>{formatTime(entry.lastMessageAt, locale, t, nowMs)}</span>
            ) : null}
          </div>
          {last ? (
            <div className={styles.row}>
              <span className={`${styles.preview} truncate`}>
                {showOwnPrefix ? (
                  <span className={styles.previewOwn}>
                    {renderPreviewStatus(last.status)}
                    {t("conversation.youPrefix")}
                  </span>
                ) : null}
                {!last.isOwn && senderPrefix}
                {previewText}
              </span>
              {entry.unreadCount > 0 ? <span className={styles.badge}>{entry.unreadCount}</span> : null}
            </div>
          ) : null}
        </div>
      </button>
      {menuOpen && canPin ? (
        <ConversationListPinMenu
          entry={entry}
          t={t}
          onTogglePin={(menuEntry) => {
            setMenuOpen(false);
            onTogglePin(menuEntry);
          }}
        />
      ) : null}
    </li>
  );
}, (prev, next) => {
  return areConversationEntriesEqual(prev.entry, next.entry)
    && prev.isActive === next.isActive
    && prev.locale === next.locale
    && prev.nowMs === next.nowMs
    && prev.t === next.t
    && prev.onSelect === next.onSelect
    && prev.onTogglePin === next.onTogglePin
    && prev.enterDelayMs === next.enterDelayMs;
});

function renderPreviewStatus(status: PreviewStatus) {
  if (status === "error") {
    return <span className={`${styles.previewStatus} ${styles.previewStatusError}`} aria-hidden="true">!</span>;
  }

  return (
    <span className={styles.previewStatus} aria-hidden="true">
      <MessageDeliveryStatusIcon status={status as MessageDeliveryStatus} size={12} />
    </span>
  );
}

function areConversationEntriesEqual(left: ConversationEntry, right: ConversationEntry): boolean {
  return left.key === right.key
    && left.id === right.id
    && left.kind === right.kind
    && left.name === right.name
    && left.lastMessageAt === right.lastMessageAt
    && left.unreadCount === right.unreadCount
    && left.isEncrypted === right.isEncrypted
    && left.pinnedAt === right.pinnedAt
    && left.pinKind === right.pinKind
    && areEntryLastMessagesEqual(left.lastMessage, right.lastMessage);
}

function areEntryLastMessagesEqual(left?: EntryLastMessage, right?: EntryLastMessage): boolean {
  if (left === right) return true;
  if (!left || !right) return !left && !right;

  return left.type === right.type
    && left.content === right.content
    && left.attachment?.kind === right.attachment?.kind
    && left.attachment?.mimeType === right.attachment?.mimeType
    && left.call === right.call
    && left.isOwn === right.isOwn
    && left.status === right.status
    && left.senderLabel === right.senderLabel;
}

function SavedAvatar() {
  return (
    <span className={styles.savedAvatar} aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3.5L5 21V5Z"
          fill="currentColor"
          fillOpacity="0.18"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function EncryptedBadge({ ariaLabel }: { readonly ariaLabel: string }) {
  return (
    <svg
      className={styles.encryptedBadge}
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="none"
      aria-label={ariaLabel}
    >
      <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function PinnedBadge({ ariaLabel }: { readonly ariaLabel: string }) {
  return (
    <svg
      className={styles.pinBadge}
      width="11"
      height="11"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-label={ariaLabel}
    >
      <path d="M9.55 1.4a.7.7 0 0 0-1.1 0L7.2 2.95l1.85 1.85L10.6 3.25a.7.7 0 0 0 0-1L9.55 1.4ZM6.5 3.65 3.85 6.3a1 1 0 0 0-.27.51l-.42 2.1 1.92-.38L7.7 5.9 6.5 3.65Zm.55 4.5L4.4 10.8l-2.5.5a.6.6 0 0 1-.7-.7l.5-2.5 2.65-2.65 2.7 2.7Zm.93-1.5L9.65 4.95l1.4 1.4-1.65 1.65-1.42-1.35Z" />
    </svg>
  );
}

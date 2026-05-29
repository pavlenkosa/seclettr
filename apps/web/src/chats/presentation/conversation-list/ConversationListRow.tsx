import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import { Avatar, MessageDeliveryStatusIcon, type MessageDeliveryStatus } from "@/components/ui";
import { IconEncrypted, IconPinned } from "@/components/ui/icons";
import { hapticSelection } from "@/lib/native-haptics";
import { useAvatarUrl } from "@/lib/hooks";
import type { PlainFolder } from "@/stores/plain";

import styles from "../ConversationList.module.css";
import { SavedMessagesAvatar } from "../SavedMessagesAvatar";
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

function useConversationLongPress(canOpenMenu: boolean, openMenu: () => void) {
  const pressStateRef = useRef<{ id: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);

  const cancelPress = useCallback(() => {
    if (pressStateRef.current) {
      clearTimeout(pressStateRef.current.id);
      pressStateRef.current = null;
    }
  }, []);

  const startPress = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!canOpenMenu || event.pointerType !== "touch") return;
    cancelPress();
    pressStateRef.current = {
      id: setTimeout(() => {
        openMenu();
        pressStateRef.current = null;
        hapticSelection();
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

  return { startPress, movePress, cancelPress };
}

function useConversationMenu(rowId: string, canOpenMenu: boolean, rowButtonRef: React.RefObject<HTMLButtonElement | null>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuFlipped, setMenuFlipped] = useState(false);
  const menuNodeRef = useRef<HTMLDivElement>(null);
  const keyboardOpenedRef = useRef(false);

  const openMenu = useCallback((viaKeyboard = false) => {
    document.dispatchEvent(
      new CustomEvent("seclettr:context-menu-open", { detail: { id: rowId } }),
    );
    keyboardOpenedRef.current = viaKeyboard;
    setMenuFlipped(false);
    setMenuOpen(true);
  }, [rowId]);

  const closeMenu = useCallback(() => {
    if (keyboardOpenedRef.current) {
      keyboardOpenedRef.current = false;
      rowButtonRef.current?.focus();
    }
    setMenuOpen(false);
  }, [rowButtonRef]);

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent<{ id: string }>).detail.id !== rowId) closeMenu();
    };
    document.addEventListener("seclettr:context-menu-open", handler);
    return () => document.removeEventListener("seclettr:context-menu-open", handler);
  }, [rowId, closeMenu]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    const onOutsideMouseDown = (event: MouseEvent) => {
      if (!menuNodeRef.current?.contains(event.target as Node)) closeMenu();
    };
    document.addEventListener("mousedown", onOutsideMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onOutsideMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, closeMenu]);

  useLayoutEffect(() => {
    if (!menuOpen || !menuNodeRef.current) return;
    const rect = menuNodeRef.current.getBoundingClientRect();
    const viewportHeight = globalThis.innerHeight ?? document.documentElement.clientHeight;
    if (rect.bottom > viewportHeight - 8) {
      setMenuFlipped(true);
    }
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!menuOpen || !menuNodeRef.current || !keyboardOpenedRef.current) return;
    const firstItem = menuNodeRef.current.querySelector<HTMLButtonElement>('button[role="menuitem"]');
    firstItem?.focus();
  }, [menuOpen]);

  const handleContextMenu = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!canOpenMenu) return;
    openMenu();
  }, [canOpenMenu, openMenu]);

  const handleRowKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!canOpenMenu) return;
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      openMenu(true);
    }
  }, [canOpenMenu, openMenu]);

  return {
    menuOpen,
    menuFlipped,
    menuNodeRef,
    openMenu,
    closeMenu,
    handleContextMenu,
    handleRowKeyDown,
  };
}

interface ConversationListRowProps {
  readonly entry: ConversationEntry;
  readonly isActive: boolean;
  readonly locale: string;
  readonly nowMs: number;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
  readonly onSelect: (selection: ConversationSelection) => void;
  readonly onTogglePin: (entry: ConversationEntry) => void;
  readonly onMoveToFolder: (entry: ConversationEntry, folderId: string) => void;
  readonly onRemoveFromFolder: (entry: ConversationEntry) => void;
  readonly onCreateFolder: (entry: ConversationEntry) => void;
  readonly onDeleteChat: (entry: ConversationEntry) => void;
  readonly folders: PlainFolder[];
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
  onMoveToFolder,
  onRemoveFromFolder,
  onCreateFolder,
  onDeleteChat,
  folders,
  enterDelayMs,
}: ConversationListRowProps) {
  const last = entry.lastMessage;
  const previewText = getPreviewText(last, t);
  const showOwnPrefix = Boolean(last?.isOwn && last.type !== "call");
  const isGroup = entry.kind === "group" || entry.kind === "plain-group";
  // Show profile photo when peer has uploaded an avatar.
  const avatarBlobUrl = useAvatarUrl(
    entry.kind === "plain-direct" || entry.kind === "direct" ? entry.id : null,
    entry.avatarKey ?? null,
  );
  const senderPrefix = last && !last.isOwn && isGroup && last.senderLabel
    ? `${last.senderLabel}: `
    : "";
  const itemStyle = {
    "--conversation-enter-delay": `${enterDelayMs}ms`,
  } as CSSProperties;
  const rowId = useId();
  const rowButtonRef = useRef<HTMLButtonElement>(null);
  const isPlainChat = entry.kind === "plain-direct" || entry.kind === "plain-group";
  const canOpenMenu = !!entry.pinKind || isPlainChat;
  const {
    menuOpen,
    menuFlipped,
    menuNodeRef,
    openMenu,
    closeMenu,
    handleContextMenu,
    handleRowKeyDown,
  } = useConversationMenu(rowId, canOpenMenu, rowButtonRef);
  const { startPress, movePress, cancelPress } = useConversationLongPress(canOpenMenu, openMenu);

  return (
    <li className={styles.itemWrap}>
      <button
        ref={rowButtonRef}
        className={`${styles.item} ${isActive ? styles.active : ""} ${entry.unreadCount > 0 ? styles.itemUnread : ""}`}
        style={itemStyle}
        onClick={() => onSelect({ kind: entry.kind, id: entry.id })}
        onContextMenu={handleContextMenu}
        onKeyDown={handleRowKeyDown}
        onPointerDown={startPress}
        onPointerUp={cancelPress}
        onPointerMove={movePress}
        onPointerCancel={cancelPress}
        onPointerLeave={cancelPress}
        data-testid={`conversation-entry:${entry.kind}:${entry.id}`}
        aria-current={isActive ? "true" : undefined}
        aria-haspopup={canOpenMenu ? "menu" : undefined}
        aria-expanded={canOpenMenu ? menuOpen : undefined}
      >
        {entry.kind === "saved"
          ? <SavedMessagesAvatar size={50} />
          : <Avatar label={entry.name} size={50} fontSize="0.9rem" ariaHidden imageUrl={avatarBlobUrl ?? undefined} />}

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
                  <>
                    {renderPreviewStatus(last.status)}
                    <span className={styles.youBadge}>{t("conversation.youBadge")}</span>
                  </>
                ) : null}
                {!last.isOwn && senderPrefix}
                {previewText}
              </span>
              {entry.unreadCount > 0 ? (
                <span
                  className={styles.badge}
                  aria-label={t("conversation.unreadBadgeAria", { count: entry.unreadCount })}
                >
                  {entry.unreadCount}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </button>
      {menuOpen && canOpenMenu ? (
        <ConversationListPinMenu
          ref={menuNodeRef}
          entry={entry}
          folders={folders}
          flipped={menuFlipped}
          t={t}
          onClose={closeMenu}
          onTogglePin={(menuEntry) => {
            closeMenu();
            onTogglePin(menuEntry);
          }}
          onMoveToFolder={(menuEntry, folderId) => {
            closeMenu();
            onMoveToFolder(menuEntry, folderId);
          }}
          onRemoveFromFolder={(menuEntry) => {
            closeMenu();
            onRemoveFromFolder(menuEntry);
          }}
          onCreateFolder={() => {
            closeMenu();
            onCreateFolder(entry);
          }}
          onDeleteChat={(menuEntry) => {
            closeMenu();
            onDeleteChat(menuEntry);
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
    && prev.onMoveToFolder === next.onMoveToFolder
    && prev.onRemoveFromFolder === next.onRemoveFromFolder
    && prev.onCreateFolder === next.onCreateFolder
    && prev.onDeleteChat === next.onDeleteChat
    && prev.folders === next.folders
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
    && left.folderId === right.folderId
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

function EncryptedBadge({ ariaLabel }: { readonly ariaLabel: string }) {
  return <IconEncrypted className={styles.encryptedBadge} ariaLabel={ariaLabel} />;
}

function PinnedBadge({ ariaLabel }: { readonly ariaLabel: string }) {
  return <IconPinned className={styles.pinBadge} ariaLabel={ariaLabel} />;
}

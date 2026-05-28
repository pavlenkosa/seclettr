import { forwardRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import type { PlainFolder } from "@/stores/plain";
import { IconChevronRight } from "@/components/ui/icons";
import type { ConversationEntry } from "./conversation-list-helpers";
import styles from "../ConversationList.module.css";

interface ConversationListPinMenuProps {
  readonly entry: ConversationEntry;
  readonly folders: PlainFolder[];
  readonly flipped?: boolean;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
  readonly onClose: () => void;
  readonly onTogglePin: (entry: ConversationEntry) => void;
  readonly onMoveToFolder: (entry: ConversationEntry, folderId: string) => void;
  readonly onRemoveFromFolder: (entry: ConversationEntry) => void;
  readonly onCreateFolder: () => void;
  readonly onDeleteChat: (entry: ConversationEntry) => void;
}

export const ConversationListPinMenu = forwardRef<HTMLDivElement, ConversationListPinMenuProps>(
function ConversationListPinMenu({
  entry,
  folders,
  flipped = false,
  t,
  onClose,
  onTogglePin,
  onMoveToFolder,
  onRemoveFromFolder,
  onCreateFolder,
  onDeleteChat,
}, ref) {
  const [folderSubmenuOpen, setFolderSubmenuOpen] = useState(false);

  const handleTogglePin = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onTogglePin(entry);
  };

  const isPlainChat = entry.kind === "plain-direct" || entry.kind === "plain-group";
  const currentFolderId = entry.folderId;
  const otherFolders = folders.filter((f) => f.folderId !== currentFolderId);

  return (
    <div
      ref={ref}
      className={`${styles.contextMenu} ${flipped ? styles.contextMenuFlipped : ""}`}
      role="menu"
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e: ReactKeyboardEvent<HTMLDivElement>) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
          return;
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End") {
          e.preventDefault();
          // Collect visible (non-aria-hidden) menu items.
          const items = Array.from(
            e.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')
          ).filter((btn) => !btn.closest('[aria-hidden="true"]'));
          if (!items.length) return;
          const currentIdx = items.indexOf(document.activeElement as HTMLButtonElement);
          let nextIdx: number;
          if (e.key === "ArrowDown") nextIdx = currentIdx < 0 ? 0 : (currentIdx + 1) % items.length;
          else if (e.key === "ArrowUp") nextIdx = currentIdx < 0 ? items.length - 1 : (currentIdx - 1 + items.length) % items.length;
          else if (e.key === "Home") nextIdx = 0;
          else nextIdx = items.length - 1;
          items[nextIdx]?.focus();
        }
      }}
    >
      {/* Pin / Unpin */}
      <button
        type="button"
        className={styles.contextMenuItem}
        onClick={handleTogglePin}
        role="menuitem"
      >
        {entry.pinnedAt ? t("conversation.unpin") : t("conversation.pin")}
      </button>

      {/* Folder actions — only for plain chats */}
      {isPlainChat ? (
        <>
          {/* Add to folder — expandable submenu */}
          <button
            type="button"
            className={`${styles.contextMenuItem} ${styles.contextMenuItemTrigger}`}
            role="menuitem"
            aria-expanded={folderSubmenuOpen}
            onClick={(e) => {
              e.stopPropagation();
              setFolderSubmenuOpen((v) => !v);
            }}
          >
            {t("folders.addToFolder")}
            <IconChevronRight
              size={13}
              strokeWidth={1.8}
              className={`${styles.contextMenuChevron} ${folderSubmenuOpen ? styles.contextMenuChevronOpen : ""}`}
            />
          </button>

          <div
            className={`${styles.contextMenuSubmenu} ${folderSubmenuOpen ? styles.contextMenuSubmenuOpen : ""}`}
            aria-hidden={!folderSubmenuOpen}
          >
            <div className={styles.contextMenuSubmenuInner}>
              {otherFolders.map((folder) => (
                <button
                  key={folder.folderId}
                  type="button"
                  className={`${styles.contextMenuItem} ${styles.contextMenuSubItem}`}
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveToFolder(entry, folder.folderId);
                  }}
                >
                  {folder.name}
                </button>
              ))}
              <button
                type="button"
                className={`${styles.contextMenuItem} ${styles.contextMenuSubItem}`}
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateFolder();
                }}
              >
                + {t("folders.create")}
              </button>
            </div>
          </div>

          {/* Remove from current folder */}
          {currentFolderId ? (
            <button
              type="button"
              className={styles.contextMenuItem}
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFromFolder(entry);
              }}
            >
              {t("folders.removeFromFolder")}
            </button>
          ) : null}

          {/* Delete chat — plain-direct only */}
          {entry.kind === "plain-direct" ? (
            <>
              <div className={styles.contextMenuSeparator} role="separator" />
              <button
                type="button"
                className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteChat(entry);
                }}
              >
                {t("conversation.deleteChat")}
              </button>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
});
ConversationListPinMenu.displayName = "ConversationListPinMenu";

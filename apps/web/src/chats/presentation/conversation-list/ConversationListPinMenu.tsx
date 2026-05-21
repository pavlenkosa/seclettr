import { useState, type MouseEvent as ReactMouseEvent } from "react";
import type { PlainFolder } from "@/stores/plain";
import { IconChevronRight } from "@/components/ui/icons";
import type { ConversationEntry } from "./conversation-list-helpers";
import styles from "../ConversationList.module.css";

interface ConversationListPinMenuProps {
  readonly entry: ConversationEntry;
  readonly folders: PlainFolder[];
  readonly t: (key: string, params?: Record<string, string | number>) => string;
  readonly onTogglePin: (entry: ConversationEntry) => void;
  readonly onMoveToFolder: (entry: ConversationEntry, folderId: string) => void;
  readonly onRemoveFromFolder: (entry: ConversationEntry) => void;
  readonly onCreateFolder: () => void;
  readonly onDeleteChat: (entry: ConversationEntry) => void;
}

export function ConversationListPinMenu({
  entry,
  folders,
  t,
  onTogglePin,
  onMoveToFolder,
  onRemoveFromFolder,
  onCreateFolder,
  onDeleteChat,
}: ConversationListPinMenuProps) {
  const [folderSubmenuOpen, setFolderSubmenuOpen] = useState(false);

  const handleTogglePin = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onTogglePin(entry);
  };

  const isPlainChat = entry.kind === "plain-direct" || entry.kind === "plain-group";
  const currentFolderId = entry.folderId;
  const otherFolders = folders.filter((f) => f.folderId !== currentFolderId);

  return (
    <div className={styles.contextMenu} role="menu" onClick={(e) => e.stopPropagation()}>
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
}

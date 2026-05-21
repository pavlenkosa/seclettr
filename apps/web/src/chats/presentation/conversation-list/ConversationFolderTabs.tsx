import { useCallback, useRef, useState } from "react";
import { IconButton } from "@/components/ui";
import { IconPlus } from "@/components/ui/icons";
import type { PlainFolder } from "@/stores/plain";
import styles from "./ConversationFolderTabs.module.css";

interface ConversationFolderTabsProps {
  readonly folders: PlainFolder[];
  readonly activeFolderId: string | null;
  readonly onSelectFolder: (folderId: string | null) => void;
  readonly onCreateFolder: () => void;
  readonly onRenameFolder: (folder: PlainFolder) => void;
  readonly onDeleteFolder: (folder: PlainFolder) => void;
  readonly t: (key: string) => string;
}

export function ConversationFolderTabs({
  folders,
  activeFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  t,
}: ConversationFolderTabsProps) {
  const [contextMenu, setContextMenu] = useState<{ folder: PlainFolder; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleTabContextMenu = useCallback(
    (e: React.MouseEvent, folder: PlainFolder) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ folder, x: e.clientX, y: e.clientY });
    },
    []
  );

  const handleCloseMenu = useCallback(() => setContextMenu(null), []);

  const handleRename = useCallback(() => {
    if (!contextMenu) return;
    onRenameFolder(contextMenu.folder);
    setContextMenu(null);
  }, [contextMenu, onRenameFolder]);

  const handleDelete = useCallback(() => {
    if (!contextMenu) return;
    onDeleteFolder(contextMenu.folder);
    setContextMenu(null);
  }, [contextMenu, onDeleteFolder]);

  if (folders.length === 0) return null;

  return (
    <div className={styles.root}>
      <div className={styles.tabs} role="tablist" aria-label={t("folders.tabListLabel")}>
        {/* "All Chats" tab */}
        <button
          type="button"
          role="tab"
          aria-selected={activeFolderId === null}
          className={`${styles.tab} ${activeFolderId === null ? styles.tabActive : ""}`}
          onClick={() => onSelectFolder(null)}
        >
          {t("folders.allChats")}
        </button>

        {/* Folder tabs */}
        {folders.map((folder) => (
          <button
            key={folder.folderId}
            type="button"
            role="tab"
            aria-selected={activeFolderId === folder.folderId}
            className={`${styles.tab} ${activeFolderId === folder.folderId ? styles.tabActive : ""}`}
            onClick={() => onSelectFolder(folder.folderId)}
            onContextMenu={(e) => handleTabContextMenu(e, folder)}
          >
            {folder.name}
          </button>
        ))}

        {/* Add folder button */}
        <IconButton
          className={styles.addBtn}
          onClick={onCreateFolder}
          title={t("folders.create")}
          aria-label={t("folders.create")}
          variant="ghost"
          size={28}
        >
          <IconPlus size={12} strokeWidth={1.7} />
        </IconButton>
      </div>

      {/* Right-click context menu for folder tabs */}
      {contextMenu ? (
        <>
          <div className={styles.menuBackdrop} onClick={handleCloseMenu} />
          <div
            ref={menuRef}
            className={styles.contextMenu}
            style={{ left: contextMenu.x, top: contextMenu.y }}
            role="menu"
          >
            <button type="button" className={styles.menuItem} role="menuitem" onClick={handleRename}>
              {t("folders.rename")}
            </button>
            <button type="button" className={`${styles.menuItem} ${styles.menuItemDanger}`} role="menuitem" onClick={handleDelete}>
              {t("folders.delete")}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

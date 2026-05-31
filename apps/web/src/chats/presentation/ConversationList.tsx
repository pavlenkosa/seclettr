/**
 * ConversationList — scrollable thread list rendered inside the chat sidebar.
 *
 * Owns:
 *   - Merging E2EE conversations, groups, plain conversations, plain groups, and saved
 *     messages into a single sorted entry list.
 *   - Folder tab bar and folder creation/rename dialog.
 *   - Per-entry context menu (move to folder, delete chat).
 *   - Loading skeleton placeholders while history is bootstrapping.
 *   - Empty-state indicator when no threads exist.
 *
 * Does not own search filtering, sidebar layout, routing/navigation, or store mutations
 * beyond the folder and delete operations exposed via `useConversationListState`.
 */
import type { Conversation } from "@/stores/messages";
import type { GroupChat } from "@/stores/groups";
import type { PlainConversation, PlainGroup } from "@/stores/plain";
import type { SavedMessage } from "@/stores/saved";
import { useI18n } from "@/i18n";
import { SeclettrMark } from "@/components/common/SeclettrMark";

import styles from "./ConversationList.module.css";
import { ExclusiveMenuProvider } from "./exclusive-menu-context";
import { ConversationListRow } from "./conversation-list/ConversationListRow";
import { ConversationFolderTabs } from "./conversation-list/ConversationFolderTabs";
import { FolderNameDialog } from "./conversation-list/FolderNameDialog";
import { DeleteChatDialog } from "./conversation-list/DeleteChatDialog";
import {
  type ConversationEntry,
  type ConversationSelection,
} from "./conversation-list/conversation-list-helpers";
import { useConversationListState } from "./conversation-list/useConversationListState";

interface Props {
  readonly conversations: Conversation[];
  readonly groups?: GroupChat[];
  readonly plainConversations?: PlainConversation[];
  readonly plainGroups?: PlainGroup[];
  readonly savedMessages?: SavedMessage[];
  readonly activeId: string | null;
  readonly loading?: boolean;
  readonly loadingPlaceholderCount?: number;
  readonly onSelect: (selection: ConversationSelection) => void;
}

export function ConversationList({
  conversations,
  groups = [],
  plainConversations = [],
  plainGroups = [],
  savedMessages = [],
  activeId,
  loading,
  loadingPlaceholderCount,
  onSelect,
}: Props) {
  const { t, locale } = useI18n();
  const {
    activeFolderId,
    deleteChatEntry,
    filteredEntries,
    folderDialog,
    folders,
    handleCreateFolderForEntry,
    handleDeleteChatConfirm,
    handleDeleteChatForEntry,
    handleDeleteFolder,
    handleFolderDialogConfirm,
    handleMoveToFolder,
    handleOpenCreateFolder,
    handleRemoveFromFolder,
    handleTogglePin,
    nowMs,
    resolvedLoadingPlaceholderCount,
    savedEntry,
    setActiveFolderId,
    setDeleteChatEntry,
    setFolderDialog,
    shouldShowSavedEntry,
  } = useConversationListState({
    activeId,
    conversations,
    groups,
    loadingPlaceholderCount,
    onSelect,
    plainConversations,
    plainGroups,
    savedMessages,
    savedTitle: t("saved.title"),
  });

  const renderConversationRow = (
    entry: ConversationEntry,
    isActive: boolean,
    enterDelayMs: number
  ) => (
    <ConversationListRow
      key={entry.key}
      entry={entry}
      isActive={isActive}
      locale={locale}
      nowMs={nowMs}
      t={t}
      onSelect={onSelect}
      onTogglePin={handleTogglePin}
      onMoveToFolder={handleMoveToFolder}
      onRemoveFromFolder={handleRemoveFromFolder}
      onCreateFolder={handleCreateFolderForEntry}
      onDeleteChat={handleDeleteChatForEntry}
      folders={folders}
      enterDelayMs={enterDelayMs}
    />
  );

  const folderTabs = folders.length > 0 ? (
    <ConversationFolderTabs
      folders={folders}
      activeFolderId={activeFolderId}
      onSelectFolder={setActiveFolderId}
      onCreateFolder={handleOpenCreateFolder}
      onRenameFolder={(folder) => setFolderDialog({ mode: "rename", folder })}
      onDeleteFolder={handleDeleteFolder}
      t={t}
    />
  ) : null;

  const folderDialogEl = folderDialog ? (
    <FolderNameDialog
      mode={folderDialog.mode}
      initialName={folderDialog.mode === "rename" ? folderDialog.folder.name : ""}
      onConfirm={(name) => void handleFolderDialogConfirm(name)}
      onCancel={() => setFolderDialog(null)}
      t={t}
    />
  ) : null;

  const deleteChatDialogEl = deleteChatEntry ? (
    <DeleteChatDialog
      chatName={deleteChatEntry.name}
      onConfirm={() => void handleDeleteChatConfirm()}
      onCancel={() => setDeleteChatEntry(null)}
      t={t}
    />
  ) : null;

  if (filteredEntries.length === 0 && loading) {
    return (
      <ExclusiveMenuProvider>
        {folderTabs}
        <ul className={styles.list} aria-busy="true" aria-label={t("conversation.loading")} data-testid="chat-thread-list">
          {shouldShowSavedEntry ? renderConversationRow(savedEntry, activeId === savedEntry.key, 0) : null}
          {Array.from({ length: resolvedLoadingPlaceholderCount }, (_, i) => (
            <li key={i} className={styles.skeletonItem} aria-hidden="true">
              <div className={styles.skeletonAvatar} />
              <div className={styles.skeletonContent}>
                <div className={styles.skeletonLine} style={{ width: `${56 + i * 14}%` }} />
                <div className={styles.skeletonLine} style={{ width: `${38 + i * 8}%`, opacity: 0.6 }} />
              </div>
            </li>
          ))}
        </ul>
        {folderDialogEl}
        {deleteChatDialogEl}
      </ExclusiveMenuProvider>
    );
  }

  if (filteredEntries.length === 0) {
    return (
      <ExclusiveMenuProvider>
        {folderTabs}
        <ul className={styles.list} aria-label={t("conversation.listLabel")} data-testid="chat-thread-list">
          {shouldShowSavedEntry ? renderConversationRow(savedEntry, activeId === savedEntry.key, 0) : null}
          <li className={styles.empty}>
            <span className={styles.emptyMark} aria-hidden="true">
              <SeclettrMark decorative />
            </span>
            <span>{activeFolderId ? t("folders.emptyFolder") : t("conversation.empty.line1")}</span>
            {!activeFolderId ? <span>{t("conversation.empty.line2")}</span> : null}
          </li>
        </ul>
        {folderDialogEl}
        {deleteChatDialogEl}
      </ExclusiveMenuProvider>
    );
  }

  return (
    <ExclusiveMenuProvider>
      {folderTabs}
      <ul className={styles.list} aria-label={t("conversation.listLabel")} data-testid="chat-thread-list">
        {shouldShowSavedEntry ? renderConversationRow(savedEntry, activeId === savedEntry.key, 0) : null}
        {filteredEntries.map((entry, index) =>
          renderConversationRow(entry, activeId === entry.key, Math.min(index + 1, 10) * 16)
        )}
      </ul>
      {folderDialogEl}
      {deleteChatDialogEl}
    </ExclusiveMenuProvider>
  );
}

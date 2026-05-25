import { useCallback, useEffect, useMemo, useState } from "react";
import type { GroupChat } from "@/stores/groups";
import type { Conversation } from "@/stores/messages";
import {
  usePlainFoldersStore,
  usePlainMessagesStore,
  usePlainPinsStore,
  type PlainConversation,
  type PlainFolder,
  type PlainGroup,
} from "@/stores/plain";
import type { SavedMessage } from "@/stores/saved";
import {
  buildConversationEntries,
  buildSavedEntry,
  clampLoadingPlaceholderCount,
  type ConversationEntry,
  type ConversationSelection,
} from "./conversation-list-helpers";

const CONVERSATION_TIME_REFRESH_MS = 60_000;

export type FolderDialog =
  | { mode: "create"; chatToAdd?: ConversationEntry }
  | { mode: "rename"; folder: PlainFolder };

interface UseConversationListStateOptions {
  conversations: Conversation[];
  groups: GroupChat[];
  plainConversations: PlainConversation[];
  plainGroups: PlainGroup[];
  savedMessages: SavedMessage[];
  loadingPlaceholderCount?: number;
  activeId: string | null;
  onSelect: (selection: ConversationSelection) => void;
  savedTitle: string;
}

/**
 * Owns `ConversationList` local orchestration state:
 * folder filter state, dialog/open-delete state, relative-time refresh cadence,
 * list sizing memory for loading placeholders, and plain-chat folder/pin actions.
 *
 * Does not own row rendering, row menu UX, or conversation projection helpers.
 */
export function useConversationListState({
  conversations,
  groups,
  plainConversations,
  plainGroups,
  savedMessages,
  loadingPlaceholderCount,
  activeId,
  onSelect,
  savedTitle,
}: UseConversationListStateOptions) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [folderDialog, setFolderDialog] = useState<FolderDialog | null>(null);
  const [deleteChatEntry, setDeleteChatEntry] = useState<ConversationEntry | null>(null);
  const [rememberedListSize, setRememberedListSize] = useState(() =>
    clampLoadingPlaceholderCount(loadingPlaceholderCount)
  );

  const pins = usePlainPinsStore((state) => state.pins);
  const pinChat = usePlainPinsStore((state) => state.pinChat);
  const unpinChat = usePlainPinsStore((state) => state.unpinChat);

  const folders = usePlainFoldersStore((state) => state.folders);
  const chatFolderMap = usePlainFoldersStore((state) => state.chatFolderMap);
  const createFolder = usePlainFoldersStore((state) => state.createFolder);
  const renameFolder = usePlainFoldersStore((state) => state.renameFolder);
  const deleteFolder = usePlainFoldersStore((state) => state.deleteFolder);
  const addChatToFolder = usePlainFoldersStore((state) => state.addChatToFolder);
  const removeChatFromFolder = usePlainFoldersStore((state) => state.removeChatFromFolder);
  const deleteConversation = usePlainMessagesStore((state) => state.deleteConversation);

  useEffect(() => {
    if (activeFolderId && !folders.find((folder) => folder.folderId === activeFolderId)) {
      setActiveFolderId(null);
    }
  }, [activeFolderId, folders]);

  const sortedEntries = useMemo<ConversationEntry[]>(() => {
    return buildConversationEntries({
      conversations,
      groups,
      pins,
      plainConversations,
      plainGroups,
      chatFolderMap,
    });
  }, [chatFolderMap, conversations, groups, pins, plainConversations, plainGroups]);

  const filteredEntries = useMemo<ConversationEntry[]>(() => {
    if (!activeFolderId) return sortedEntries;
    return sortedEntries.filter((entry) =>
      (entry.kind === "plain-direct" || entry.kind === "plain-group")
        && entry.folderId === activeFolderId
    );
  }, [activeFolderId, sortedEntries]);

  const savedEntry = useMemo<ConversationEntry>(
    () => buildSavedEntry(savedMessages, savedTitle),
    [savedMessages, savedTitle]
  );

  const handleTogglePin = useCallback((entry: ConversationEntry) => {
    if (!entry.pinKind) return;
    if (entry.pinnedAt) {
      void unpinChat(entry.pinKind, entry.id);
      return;
    }
    void pinChat(entry.pinKind, entry.id);
  }, [pinChat, unpinChat]);

  const handleMoveToFolder = useCallback((entry: ConversationEntry, folderId: string) => {
    if (!entry.pinKind) return;
    void addChatToFolder(folderId, entry.pinKind, entry.id);
  }, [addChatToFolder]);

  const handleRemoveFromFolder = useCallback((entry: ConversationEntry) => {
    if (!entry.pinKind || !entry.folderId) return;
    void removeChatFromFolder(entry.folderId, entry.pinKind, entry.id);
  }, [removeChatFromFolder]);

  const handleFolderDialogConfirm = useCallback(async (name: string) => {
    if (!folderDialog) return;

    if (folderDialog.mode === "create") {
      const created = await createFolder(name);
      if (created) {
        setActiveFolderId(created.folderId);
        const chatToAdd = folderDialog.chatToAdd;
        if (chatToAdd?.pinKind) {
          void addChatToFolder(created.folderId, chatToAdd.pinKind, chatToAdd.id);
        }
      }
    } else {
      await renameFolder(folderDialog.folder.folderId, name);
    }

    setFolderDialog(null);
  }, [addChatToFolder, createFolder, folderDialog, renameFolder]);

  const handleDeleteFolder = useCallback(async (folder: PlainFolder) => {
    await deleteFolder(folder.folderId);
  }, [deleteFolder]);

  const hasRelativeTimeLabels = useMemo(
    () =>
      filteredEntries.some(
        (entry) => entry.lastMessageAt > 0 && nowMs - entry.lastMessageAt < 3_600_000
      ),
    [filteredEntries, nowMs]
  );

  useEffect(() => {
    if (!hasRelativeTimeLabels) return;
    const timerId = setInterval(() => {
      setNowMs(Date.now());
    }, CONVERSATION_TIME_REFRESH_MS);
    return () => clearInterval(timerId);
  }, [hasRelativeTimeLabels]);

  useEffect(() => {
    if (sortedEntries.length > 0) {
      setRememberedListSize(clampLoadingPlaceholderCount(sortedEntries.length));
    }
  }, [sortedEntries.length]);

  const resolvedLoadingPlaceholderCount = clampLoadingPlaceholderCount(
    Math.max(loadingPlaceholderCount ?? 0, rememberedListSize)
  );

  const handleDeleteChatForEntry = useCallback((entry: ConversationEntry) => {
    setDeleteChatEntry(entry);
  }, []);

  const handleDeleteChatConfirm = useCallback(async () => {
    if (!deleteChatEntry || deleteChatEntry.kind !== "plain-direct") return;

    await deleteConversation(deleteChatEntry.id);
    setDeleteChatEntry(null);
    if (activeId === deleteChatEntry.key) {
      onSelect({ kind: "plain-direct", id: "" });
    }
  }, [activeId, deleteChatEntry, deleteConversation, onSelect]);

  const handleOpenCreateFolder = useCallback(() => {
    setFolderDialog({ mode: "create" });
  }, []);

  const handleCreateFolderForEntry = useCallback((entry: ConversationEntry) => {
    setFolderDialog({ mode: "create", chatToAdd: entry });
  }, []);

  return {
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
    shouldShowSavedEntry: !activeFolderId,
  };
}

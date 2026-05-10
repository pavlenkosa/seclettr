import {
  useCallback,
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { type DirectCallPanelHandle } from "@/calls/direct";
import { useI18n } from "@/i18n";

interface ThreadSelection {
  kind: "direct" | "group" | "plain-direct" | "plain-group";
  id: string;
}

interface ActiveConversationSummary {
  userId: string;
  username: string;
}

interface ActiveGroupSummary {
  groupId: string;
}

interface UseChatWorkspaceInteractionsOptions {
  activeConversation: ActiveConversationSummary | null;
  activePlainConversation: ActiveConversationSummary | null;
  activeGroup: ActiveGroupSummary | null;
  activeThreadKind: "direct" | "group" | "plain-direct" | "plain-group" | null;
  directCallPanelRef: RefObject<DirectCallPanelHandle | null>;
  showChatNotice: (message: string) => void;
  ensureConversation: (userId: string, username: string) => void;
  ensurePlainConversation: (userId: string, username: string) => void;
  handleSelectThread: (selection: ThreadSelection) => void;
  logout: () => Promise<unknown>;
  lock: () => Promise<void>;
  setMobileCreateMenuOpen: Dispatch<SetStateAction<boolean>>;
  openSettings: () => void;
  openNewChat: () => void;
  closeNewChat: () => void;
  openNewGroup: () => void;
  openGroupMembers: () => void;
  closeGroupMembers: () => void;
  openChatTypePicker: (user: { userId: string; username: string }) => void;
  closeChatTypePicker: () => void;
}

interface UseChatWorkspaceInteractionsResult {
  handleLogout: () => void;
  handleLock: () => void;
  handleOpenSettings: () => void;
  handleOpenNewChat: () => void;
  handleOpenNewGroup: () => void;
  handleOpenGroupMembers: () => void;
  handleToggleCreateMenu: () => void;
  handleCloseCreateMenu: () => void;
  handleMobileOpenSettings: () => void;
  handleMobileOpenChats: () => void;
  handleStartCall: (type: "audio" | "video") => void;
  handleNewChatSelect: (selectedUserId: string, selectedUsername: string) => void;
  handleNewChatSelectE2ee: (selectedUserId: string, selectedUsername: string) => void;
  handleNewChatSelectPlain: (selectedUserId: string, selectedUsername: string) => void;
  handleComposerFocusChange: (focused: boolean) => void;
}

export function useChatWorkspaceInteractions(
  options: UseChatWorkspaceInteractionsOptions
): UseChatWorkspaceInteractionsResult {
  const { t } = useI18n();
  const {
    activeConversation,
    activePlainConversation,
    activeGroup,
    activeThreadKind,
    closeGroupMembers,
    closeNewChat,
    directCallPanelRef,
    ensureConversation,
    ensurePlainConversation,
    handleSelectThread,
    lock,
    logout,
    openGroupMembers,
    openNewChat,
    openNewGroup,
    openSettings,
    openChatTypePicker,
    closeChatTypePicker,
    setMobileCreateMenuOpen,
    showChatNotice,
  } = options;

  useEffect(() => {
    if (activeThreadKind !== "group" && activeThreadKind !== "plain-group" || !activeGroup) {
      closeGroupMembers();
    }
  }, [activeGroup, activeThreadKind, closeGroupMembers]);

  const handleLogout = useCallback(() => {
    void logout();
  }, [logout]);

  const handleLock = useCallback(() => {
    void lock();
  }, [lock]);

  const handleOpenSettings = useCallback(() => {
    openSettings();
  }, [openSettings]);

  const handleOpenNewChat = useCallback(() => {
    openNewChat();
  }, [openNewChat]);

  const handleOpenNewGroup = useCallback(() => {
    openNewGroup();
  }, [openNewGroup]);

  const handleOpenGroupMembers = useCallback(() => {
    openGroupMembers();
  }, [openGroupMembers]);

  const handleToggleCreateMenu = useCallback(() => {
    setMobileCreateMenuOpen((isOpen) => !isOpen);
  }, [setMobileCreateMenuOpen]);

  const handleCloseCreateMenu = useCallback(() => {
    setMobileCreateMenuOpen(false);
  }, [setMobileCreateMenuOpen]);

  const handleMobileOpenSettings = useCallback(() => {
    setMobileCreateMenuOpen(false);
    openSettings();
  }, [openSettings, setMobileCreateMenuOpen]);

  const handleMobileOpenChats = useCallback(() => {
    setMobileCreateMenuOpen(false);
  }, [setMobileCreateMenuOpen]);

  const handleStartCall = useCallback(
    (type: "audio" | "video") => {
      const peer = activeThreadKind === "plain-direct" ? activePlainConversation : activeConversation;
      if (!peer) return;

      directCallPanelRef.current
        ?.startCall(peer.userId, type, peer.username)
        .catch(() => {
          showChatNotice(t("call.error.unableStart"));
        });
    },
    [activeConversation, activePlainConversation, activeThreadKind, directCallPanelRef, showChatNotice, t]
  );

  const handleNewChatSelect = useCallback(
    (selectedUserId: string, selectedUsername: string) => {
      closeNewChat();
      openChatTypePicker({ userId: selectedUserId, username: selectedUsername });
    },
    [closeNewChat, openChatTypePicker]
  );

  const handleNewChatSelectE2ee = useCallback(
    (selectedUserId: string, selectedUsername: string) => {
      closeChatTypePicker();
      ensureConversation(selectedUserId, selectedUsername);
      handleSelectThread({ kind: "direct", id: selectedUserId });
    },
    [closeChatTypePicker, ensureConversation, handleSelectThread]
  );

  const handleNewChatSelectPlain = useCallback(
    (selectedUserId: string, selectedUsername: string) => {
      closeChatTypePicker();
      ensurePlainConversation(selectedUserId, selectedUsername);
      handleSelectThread({ kind: "plain-direct", id: selectedUserId });
    },
    [closeChatTypePicker, ensurePlainConversation, handleSelectThread]
  );

  const handleComposerFocusChange = useCallback(
    (focused: boolean) => {
      if (focused) {
        setMobileCreateMenuOpen(false);
      }
    },
    [setMobileCreateMenuOpen]
  );

  return {
    handleLogout,
    handleLock,
    handleOpenSettings,
    handleOpenNewChat,
    handleOpenNewGroup,
    handleOpenGroupMembers,
    handleToggleCreateMenu,
    handleCloseCreateMenu,
    handleMobileOpenSettings,
    handleMobileOpenChats,
    handleStartCall,
    handleNewChatSelect,
    handleNewChatSelectE2ee,
    handleNewChatSelectPlain,
    handleComposerFocusChange,
  };
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import { useMobileCreateMenu } from "./useMobileCreateMenu";

interface ChatWorkspaceUiState {
  showNewChat: boolean;
  showNewGroup: boolean;
  showGroupMembers: boolean;
  showSettings: boolean;
  mobileShowConversation: boolean;
  chatNotice: string | null;
  mobileCreateMenuOpen: boolean;
  setMobileCreateMenuOpen: Dispatch<SetStateAction<boolean>>;
  mobileCreateMenuRef: RefObject<HTMLDivElement>;
  mobileCreateMenuId: string;
  handleMobileCreateMenuKeyDown: (
    event: ReactKeyboardEvent<HTMLDivElement>
  ) => void;
  setMobileShowConversation: Dispatch<SetStateAction<boolean>>;
  showChatNotice: (message: string) => void;
  openNewChat: () => void;
  closeNewChat: () => void;
  openNewGroup: () => void;
  closeNewGroup: () => void;
  openGroupMembers: () => void;
  closeGroupMembers: () => void;
  openSettings: () => void;
  closeSettings: () => void;
}

export function useChatWorkspaceUiState(): ChatWorkspaceUiState {
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mobileShowConversation, setMobileShowConversation] = useState(false);
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const chatNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    isOpen: mobileCreateMenuOpen,
    setIsOpen: setMobileCreateMenuOpen,
    menuRef: mobileCreateMenuRef,
    menuId: mobileCreateMenuId,
    handleKeyDown: handleMobileCreateMenuKeyDown,
  } = useMobileCreateMenu({
    closeWhen: showNewChat || showNewGroup || showSettings,
  });


  const showChatNotice = useCallback((message: string) => {
    if (chatNoticeTimerRef.current) {
      clearTimeout(chatNoticeTimerRef.current);
    }
    setChatNotice(message);
    chatNoticeTimerRef.current = setTimeout(() => setChatNotice(null), 4_000);
  }, []);

  useEffect(() => {
    return () => {
      if (chatNoticeTimerRef.current) {
        clearTimeout(chatNoticeTimerRef.current);
      }
    };
  }, []);

  const openNewChat = useCallback(() => setShowNewChat(true), []);
  const closeNewChat = useCallback(() => setShowNewChat(false), []);
  const openNewGroup = useCallback(() => setShowNewGroup(true), []);
  const closeNewGroup = useCallback(() => setShowNewGroup(false), []);
  const openGroupMembers = useCallback(() => setShowGroupMembers(true), []);
  const closeGroupMembers = useCallback(() => setShowGroupMembers(false), []);
  const openSettings = useCallback(() => setShowSettings(true), []);
  const closeSettings = useCallback(() => setShowSettings(false), []);

  return {
    showNewChat,
    showNewGroup,
    showGroupMembers,
    showSettings,
    mobileShowConversation,
    chatNotice,
    mobileCreateMenuOpen,
    setMobileCreateMenuOpen,
    mobileCreateMenuRef,
    mobileCreateMenuId,
    handleMobileCreateMenuKeyDown,
    setMobileShowConversation,
    showChatNotice,
    openNewChat,
    closeNewChat,
    openNewGroup,
    closeNewGroup,
    openGroupMembers,
    closeGroupMembers,
    openSettings,
    closeSettings,
  };
}

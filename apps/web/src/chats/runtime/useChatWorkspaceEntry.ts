import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { useMessagesStore, type Message } from "@/stores/messages";
import { useGroupsStore } from "@/stores/groups";
import { usePlainMessagesStore, usePlainGroupsStore } from "@/stores/plain";
import { useSavedMessagesStore } from "@/stores/saved";
import { useChatWorkspaceCallEntry } from "./useChatWorkspaceCallEntry";
import { useChatWorkspaceRoutingBootstrap } from "./useChatWorkspaceRoutingBootstrap";
import { useChatWorkspacePresenceEffects } from "./useChatWorkspacePresenceEffects";
import { useChatWorkspaceProjection } from "./useChatWorkspaceProjection";
import { useChatWorkspaceThreadActions } from "./useChatWorkspaceThreadActions";

interface UseChatWorkspaceEntryOptions {
  userId: string | null;
  setMobileShowConversation: Dispatch<SetStateAction<boolean>>;
  setMobileCreateMenuOpen: Dispatch<SetStateAction<boolean>>;
}

export function useChatWorkspaceEntry(options: UseChatWorkspaceEntryOptions) {
  const {
    setMobileCreateMenuOpen,
    setMobileShowConversation,
    userId,
  } = options;

  const {
    activeConversationId,
    conversations,
    setActiveConversation,
    fetchUserPresence,
    markConversationRead,
    acceptPeerIdentityChange,
    ensureConversation,
    upsertConversation,
    retryDirectMessage,
  } = useMessagesStore(useShallow((state) => ({
    activeConversationId: state.activeConversationId,
    conversations: state.conversations,
    setActiveConversation: state.setActiveConversation,
    fetchUserPresence: state.fetchUserPresence,
    markConversationRead: state.markConversationRead,
    acceptPeerIdentityChange: state.acceptPeerIdentityChange,
    ensureConversation: state.ensureConversation,
    upsertConversation: state.upsertConversation,
    retryDirectMessage: state.retryDirectMessage,
  })));
  const {
    groups,
    activeGroupId,
    setActiveGroup,
    loadGroupMessages,
    createGroup,
    retryGroupMessage,
  } = useGroupsStore(useShallow((state) => ({
    groups: state.groups,
    activeGroupId: state.activeGroupId,
    setActiveGroup: state.setActiveGroup,
    loadGroupMessages: state.loadGroupMessages,
    createGroup: state.createGroup,
    retryGroupMessage: state.retryGroupMessage,
  })));
  const {
    plainConversations,
    sendPlainText,
    sendPlainAttachment,
    loadPlainHistory,
  } = usePlainMessagesStore(useShallow((state) => ({
    plainConversations: state.conversations,
    sendPlainText: state.sendText,
    sendPlainAttachment: state.sendAttachment,
    loadPlainHistory: state.loadHistory,
  })));

  const {
    plainGroups,
    sendPlainGroupText,
    sendPlainGroupAttachment,
    createPlainGroup,
    loadPlainGroupMessages,
  } = usePlainGroupsStore(useShallow((state) => ({
    plainGroups: state.groups,
    sendPlainGroupText: state.sendText,
    sendPlainGroupAttachment: state.sendAttachment,
    createPlainGroup: state.createGroup,
    loadPlainGroupMessages: state.loadHistory,
  })));

  const [activePlainConversationId, setActivePlainConversation] = useState<string | null>(null);
  const [activePlainGroupId, setActivePlainGroup] = useState<string | null>(null);
  const [savedThreadActive, setSavedThreadActive] = useState(false);

  const savedMessages = useSavedMessagesStore((state) => state.messages);
  const addSavedMessage = useSavedMessagesStore((state) => state.addMessage);
  const addSavedMessageWithAttachment = useSavedMessagesStore((state) => state.addMessageWithAttachment);

  const activeConversation = useMessagesStore(
    useCallback(
      (state) => (
        activeConversationId
          ? state.conversations[activeConversationId] ?? null
          : null
      ),
      [activeConversationId]
    )
  );
  const activeGroup = activeGroupId ? groups[activeGroupId] ?? null : null;

  const activePlainConversation = activePlainConversationId
    ? plainConversations[activePlainConversationId] ?? null
    : null;
  const activePlainGroup = activePlainGroupId ? plainGroups[activePlainGroupId] ?? null : null;

  const activeThreadKind: "direct" | "group" | "plain-direct" | "plain-group" | "saved" | null =
    activeConversation
      ? "direct"
      : activeGroup
        ? "group"
        : activePlainConversation
          ? "plain-direct"
          : activePlainGroup
            ? "plain-group"
            : savedThreadActive
              ? "saved"
              : null;

  const {
    upsertPlainConversation,
    ensurePlainConversation,
    handleRetryMessage,
  } = useChatWorkspaceThreadActions({
    plainConversations,
    activeThreadKind,
    activeConversationUserId: activeConversation?.userId ?? null,
    activeGroupId,
    activePlainConversationId,
    activePlainGroupId,
    retryDirectMessage,
    retryGroupMessage,
  });

  const {
    handleBack,
    handleSelectThread,
  } = useChatWorkspaceRoutingBootstrap({
    conversations,
    activeConversationId,
    activeGroupId,
    setActiveConversation,
    setActiveGroup,
    loadGroupMessages,
    getGroupsState: useGroupsStore.getState,
    plainConversations,
    activePlainConversationId,
    activePlainGroupId,
    setActivePlainConversation,
    setActivePlainGroup,
    loadPlainGroupMessages,
    savedThreadActive,
    setSavedThreadActive,
    setMobileShowConversation,
    setMobileCreateMenuOpen,
    upsertConversation,
    upsertPlainConversation,
  });

  const {
    activeConversationUserId,
    activePeerIdentityAlertCount,
    activePresence,
    activeTyping,
    directTrustBlocked,
    plainActivePresence,
    plainActiveTyping,
  } = useChatWorkspacePresenceEffects({
    activeConversation,
    activePlainConversation,
    fetchUserPresence,
    loadPlainHistory,
    markConversationRead,
  });

  const {
    activeGroupCall,
    activeGroupCallParticipantIds,
    missedCall,
    clearMissedCall,
    groupCallSession,
    groupCallNoticeSurface,
    handleStartGroupCall,
    handleJoinActiveGroupCall,
    handleCloseGroupCallPanel,
    globalGroupCallAlerts,
  } = useChatWorkspaceCallEntry({
    activeGroup,
    activeGroupId,
    groups,
    userId,
  });

  const sendSavedMessage = useCallback(
    (content: string) => {
      addSavedMessage(content);
    },
    [addSavedMessage]
  );

  const sendSavedFile = useCallback(
    (file: File, options: { kind: "file" | "voice_note" | "video_note"; durationMs?: number; caption?: string }) =>
      addSavedMessageWithAttachment(file, options),
    [addSavedMessageWithAttachment]
  );

  const {
    activeHistoryLoading,
    activeListId,
    activeMessages,
    conversationEntries,
    groupEntries,
    groupSenderLabels,
    plainConversationEntries,
    plainGroupEntries,
  } = useChatWorkspaceProjection({
    activeConversation,
    activeGroup,
    activePlainConversation,
    activePlainGroup,
    conversations,
    groups,
    plainConversations,
    plainGroups,
    savedThreadActive,
    savedMessages,
    userId,
  });

  return {
    acceptPeerIdentityChange,
    activeConversation,
    activeConversationId,
    activePeerIdentityAlertCount,
    activeConversationUserId,
    activeGroup,
    activeGroupCall,
    activeGroupCallParticipantIds,
    activeGroupId,
    activeHistoryLoading,
    activeListId,
    activeMessages,
    activePresence,
    activeThreadKind,
    activeTyping,
    clearMissedCall,
    conversationEntries,
    createGroup,
    directTrustBlocked,
    ensureConversation,
    globalGroupCallAlerts,
    groupCallNoticeSurface,
    groupCallSession,
    groupEntries,
    groupSenderLabels,
    handleBack,
    handleCloseGroupCallPanel,
    handleJoinActiveGroupCall,
    handleRetryMessage,
    handleSelectThread,
    handleStartGroupCall,
    missedCall,
    activePlainConversation,
    activePlainConversationId,
    activePlainGroup,
    activePlainGroupId,
    plainActivePresence,
    plainActiveTyping,
    plainConversationEntries,
    plainGroupEntries,
    sendPlainText,
    sendPlainAttachment,
    createPlainGroup,
    sendPlainGroupText,
    sendPlainGroupAttachment,
    ensurePlainConversation,
    savedThreadActive,
    savedMessages,
    sendSavedMessage,
    sendSavedFile,
  };
}

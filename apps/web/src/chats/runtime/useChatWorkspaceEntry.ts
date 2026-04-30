import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useShallow } from "zustand/react/shallow";
import { api } from "@/lib/api";
import { sanitizeDisplayTextOrFallback } from "@/lib/display-text";
import { logger } from "@/lib/logger.js";
import { useGroupCallChatEntry, useGlobalGroupCallAlerts } from "@/calls/group";
import { useMessagesStore, type Message } from "@/stores/messages";
import { useGroupsStore, type GroupChatMessage } from "@/stores/groups";
import { useChatThreadRouting } from "./useChatThreadRouting";

interface UseChatWorkspaceEntryOptions {
  userId: string | null;
  setMobileShowConversation: Dispatch<SetStateAction<boolean>>;
  setMobileCreateMenuOpen: Dispatch<SetStateAction<boolean>>;
}

interface GroupMessageProjectionCache {
  sourceMessages: readonly GroupChatMessage[];
  activeMessages: Message[];
  senderLabels: Record<string, string>;
}

function toChatMessage(message: GroupChatMessage): Message {
  return {
    id: message.id,
    senderId: message.senderDeviceId,
    senderDeviceId: message.senderDeviceId,
    content: message.content,
    type: message.type ?? "text",
    attachment: message.attachment,
    timestamp: message.timestamp,
    status: message.status,
    isOwn: message.isOwn,
    replyTo: message.replyTo,
  };
}

function buildGroupMessageProjection(
  sourceMessages: readonly GroupChatMessage[],
  previous: GroupMessageProjectionCache | null
): GroupMessageProjectionCache {
  if (previous?.sourceMessages === sourceMessages) {
    return previous;
  }

  const sharedLength = Math.min(previous?.sourceMessages.length ?? 0, sourceMessages.length);
  let firstChangedIndex = 0;
  while (
    previous
    && firstChangedIndex < sharedLength
    && previous.sourceMessages[firstChangedIndex] === sourceMessages[firstChangedIndex]
  ) {
    firstChangedIndex += 1;
  }

  const activeMessages = previous
    ? previous.activeMessages.slice(0, firstChangedIndex)
    : [];
  for (let index = firstChangedIndex; index < sourceMessages.length; index += 1) {
    activeMessages.push(toChatMessage(sourceMessages[index]!));
  }

  const senderLabels: Record<string, string> = {};
  for (const message of sourceMessages) {
    if (!message.isOwn) {
      senderLabels[message.id] = message.senderLabel;
    }
  }

  return {
    sourceMessages,
    activeMessages,
    senderLabels,
  };
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
  const groupMessageProjectionCacheRef = useRef<GroupMessageProjectionCache | null>(null);

  const {
    routeConversationId,
    handleBack,
    handleSelectThread,
  } = useChatThreadRouting({
    conversations,
    activeConversationId,
    activeGroupId,
    setActiveConversation,
    setActiveGroup,
    loadGroupMessages,
    getGroupsState: useGroupsStore.getState,
    setMobileShowConversation,
    setMobileCreateMenuOpen,
  });

  useEffect(() => {
    if (!routeConversationId) return;
    if (conversations[routeConversationId]) return;
    let cancelled = false;
    const abortController = new AbortController();
    api
      .get<{ userId: string; username: string }>(
        `/users/${encodeURIComponent(routeConversationId)}`,
        { signal: abortController.signal }
      )
      .then((user) => {
        if (cancelled) {
          return;
        }
        upsertConversation({
          userId: user.userId,
          username: sanitizeDisplayTextOrFallback(user.username, user.userId),
          messages: [],
          lastMessageAt: 0,
          unreadCount: 0,
        });
        setActiveConversation(user.userId);
        setMobileShowConversation(true);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        logger.warn("[ChatPage] bootstrap direct deep-link failed", err);
      });
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    conversations,
    routeConversationId,
    setActiveConversation,
    setMobileShowConversation,
    upsertConversation,
  ]);

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
  const activeGroupThreadKind = activeGroup ? "group" as const : null;
  const activeThreadKind: "direct" | "group" | null = activeConversation
    ? "direct"
    : activeGroupThreadKind;
  const activeConversationUserId = activeConversation?.userId ?? null;
  const activePeerIdentityAlertCount = Object.keys(
    activeConversation?.peerIdentityAlertsByDevice ?? {}
  ).length;
  const directTrustBlocked = activePeerIdentityAlertCount > 0;
  const activePresence = useMessagesStore(
    useCallback(
      (state) => (
        activeConversationUserId
          ? state.presenceByUser[activeConversationUserId]
          : undefined
      ),
      [activeConversationUserId]
    )
  );
  const activeTyping = useMessagesStore(
    useCallback(
      (state) => (
        activeConversationUserId
          ? state.typingByUser[activeConversationUserId]?.typing
          : false
      ),
      [activeConversationUserId]
    )
  );

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
  } = useGroupCallChatEntry({
    activeGroup,
    groups,
    userId,
  });

  const globalGroupCallAlerts = useGlobalGroupCallAlerts(userId, activeGroupId);

  useEffect(() => {
    if (!activeConversationUserId) return;
    fetchUserPresence(activeConversationUserId);
    markConversationRead(activeConversationUserId);
    const refreshTimer = setInterval(() => {
      fetchUserPresence(activeConversationUserId);
    }, 30_000);
    return () => clearInterval(refreshTimer);
  }, [activeConversationUserId, fetchUserPresence, markConversationRead]);

  const handleRetryMessage = useCallback(
    (messageId: string) => {
      if (activeThreadKind === "direct" && activeConversationUserId) {
        retryDirectMessage(activeConversationUserId, messageId);
        return;
      }
      if (activeThreadKind === "group" && activeGroupId) {
        retryGroupMessage(activeGroupId, messageId);
      }
    },
    [
      activeConversationUserId,
      activeGroupId,
      activeThreadKind,
      retryDirectMessage,
      retryGroupMessage,
    ]
  );

  const activeGroupListId = activeGroup ? `group:${activeGroup.groupId}` : null;
  const activeListId = activeConversation
    ? `direct:${activeConversation.userId}`
    : activeGroupListId;

  const conversationEntries = useMemo(
    () => Object.values(conversations),
    [conversations]
  );
  const groupEntries = useMemo(() => Object.values(groups), [groups]);
  const activeGroupProjection = useMemo(() => {
    if (!activeGroup) return null;
    const nextProjection = buildGroupMessageProjection(
      activeGroup.messages,
      groupMessageProjectionCacheRef.current
    );
    groupMessageProjectionCacheRef.current = nextProjection;
    return nextProjection;
  }, [activeGroup]);

  const activeMessages = useMemo<Message[]>(() => {
    if (activeConversation) return activeConversation.messages;
    return activeGroupProjection?.activeMessages ?? [];
  }, [activeConversation, activeGroupProjection]);

  const groupSenderLabels = activeGroupProjection?.senderLabels;

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
  };
}

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
import { usePlainMessagesStore, usePlainGroupsStore, type PlainMessage } from "@/stores/plain";
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

  const upsertPlainConversation = useCallback(
    (conv: { userId: string; username: string }) => {
      usePlainMessagesStore.setState((s) => {
        if (s.conversations[conv.userId]) return s;
        return {
          conversations: {
            ...s.conversations,
            [conv.userId]: {
              userId: conv.userId,
              username: conv.username,
              messages: [],
              lastMessageAt: 0,
              unreadCount: 0,
              hasMore: false,
              historyLoaded: false,
            },
          },
        };
      });
    },
    []
  );

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

  const ensurePlainConversation = useCallback(
    (peerUserId: string, peerUsername: string) => {
      if (!plainConversations[peerUserId]) {
        usePlainMessagesStore.setState((s) => ({
          conversations: {
            ...s.conversations,
            [peerUserId]: {
              userId: peerUserId,
              username: peerUsername,
              messages: [],
              lastMessageAt: 0,
              unreadCount: 0,
              hasMore: false,
              historyLoaded: false,
            },
          },
        }));
      }
    },
    [plainConversations]
  );

  const retryPlainMessage = useCallback(
    (_conversationId: string, _messageId: string) => {
      // Plain messages don't have a retry mechanism in the store yet — no-op
    },
    []
  );

  const retryPlainGroupMessage = useCallback(
    (_groupId: string, _messageId: string) => {
      // Plain group messages don't have a retry mechanism in the store yet — no-op
    },
    []
  );

  const {
    routeConversationId,
    routePlainConversationId,
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
    plainConversations,
    activePlainConversationId,
    activePlainGroupId,
    setActivePlainConversation,
    setActivePlainGroup,
    loadPlainGroupMessages,
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
        if (cancelled) return;
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
        if (cancelled) return;
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

  useEffect(() => {
    if (!routePlainConversationId) return;
    if (plainConversations[routePlainConversationId]) return;
    let cancelled = false;
    const abortController = new AbortController();
    api
      .get<{ userId: string; username: string }>(
        `/users/${encodeURIComponent(routePlainConversationId)}`,
        { signal: abortController.signal }
      )
      .then((user) => {
        if (cancelled) return;
        upsertPlainConversation({
          userId: user.userId,
          username: sanitizeDisplayTextOrFallback(user.username, user.userId),
        });
        setActivePlainConversation(user.userId);
        setMobileShowConversation(true);
      })
      .catch((err) => {
        if (cancelled) return;
        logger.warn("[ChatPage] bootstrap plain direct deep-link failed", err);
      });
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    plainConversations,
    routePlainConversationId,
    setActivePlainConversation,
    setMobileShowConversation,
    upsertPlainConversation,
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

  const activePlainConversation = activePlainConversationId
    ? plainConversations[activePlainConversationId] ?? null
    : null;
  const activePlainGroup = activePlainGroupId ? plainGroups[activePlainGroupId] ?? null : null;

  // Auto-load history when a plain-direct thread is opened or created via deep-link.
  useEffect(() => {
    if (!activePlainConversation || activePlainConversation.historyLoaded) return;
    void loadPlainHistory(activePlainConversation.userId, activePlainConversation.username);
  }, [activePlainConversation?.userId, activePlainConversation?.historyLoaded, loadPlainHistory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Send read receipt when opening a plain-direct thread (or when history finishes loading).
  useEffect(() => {
    if (!activePlainConversation?.historyLoaded) return;
    if (activePlainConversation.unreadCount === 0) return;
    usePlainMessagesStore.getState().markRead(activePlainConversation.userId);
  }, [activePlainConversation?.userId, activePlainConversation?.historyLoaded, activePlainConversation?.unreadCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeThreadKind: "direct" | "group" | "plain-direct" | "plain-group" | null =
    activeConversation
      ? "direct"
      : activeGroup
        ? "group"
        : activePlainConversation
          ? "plain-direct"
          : activePlainGroup
            ? "plain-group"
            : null;

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
    void fetchUserPresence(activeConversationUserId);
    void markConversationRead(activeConversationUserId);
    const refreshTimer = setInterval(() => {
      void fetchUserPresence(activeConversationUserId);
    }, 30_000);
    return () => clearInterval(refreshTimer);
  }, [activeConversationUserId, fetchUserPresence, markConversationRead]);

  const plainPeerUserId = activePlainConversation?.userId ?? null;
  const plainActivePresence = useMessagesStore(
    useCallback(
      (state) => (plainPeerUserId ? state.presenceByUser[plainPeerUserId] : undefined),
      [plainPeerUserId]
    )
  );

  useEffect(() => {
    if (!plainPeerUserId) return;
    void fetchUserPresence(plainPeerUserId);
    const refreshTimer = setInterval(() => {
      void fetchUserPresence(plainPeerUserId);
    }, 30_000);
    return () => clearInterval(refreshTimer);
  }, [plainPeerUserId, fetchUserPresence]);

  const handleRetryMessage = useCallback(
    (messageId: string) => {
      if (activeThreadKind === "direct" && activeConversationUserId) {
        void retryDirectMessage(activeConversationUserId, messageId);
        return;
      }
      if (activeThreadKind === "group" && activeGroupId) {
        void retryGroupMessage(activeGroupId, messageId);
        return;
      }
      if (activeThreadKind === "plain-direct" && activePlainConversationId) {
        void retryPlainMessage(activePlainConversationId, messageId);
        return;
      }
      if (activeThreadKind === "plain-group" && activePlainGroupId) {
        void retryPlainGroupMessage(activePlainGroupId, messageId);
      }
    },
    [
      activeConversationUserId,
      activeGroupId,
      activePlainConversationId,
      activePlainGroupId,
      activeThreadKind,
      retryDirectMessage,
      retryGroupMessage,
      retryPlainMessage,
      retryPlainGroupMessage,
    ]
  );

  const activeGroupListId = activeGroup ? `group:${activeGroup.groupId}` : null;
  const activePlainGroupListId = activePlainGroup ? `plain-group:${activePlainGroup.groupId}` : null;
  const activeListId =
    activeConversation
      ? `direct:${activeConversation.userId}`
      : activeGroupListId
        ?? (activePlainConversation ? `plain-direct:${activePlainConversation.userId}` : null)
        ?? activePlainGroupListId;

  const conversationEntries = useMemo(
    () => Object.values(conversations),
    [conversations]
  );
  const groupEntries = useMemo(() => Object.values(groups), [groups]);
  const plainConversationEntries = useMemo(
    () => Object.values(plainConversations),
    [plainConversations]
  );
  const plainGroupEntries = useMemo(() => Object.values(plainGroups), [plainGroups]);

  const activeGroupProjection = useMemo(() => {
    if (!activeGroup) return null;
    const nextProjection = buildGroupMessageProjection(
      activeGroup.messages,
      groupMessageProjectionCacheRef.current
    );
    groupMessageProjectionCacheRef.current = nextProjection;
    return nextProjection;
  }, [activeGroup]);

  const plainActiveMessages = useMemo<PlainMessage[]>(() => {
    if (activePlainConversation) return activePlainConversation.messages;
    if (activePlainGroup) return activePlainGroup.messages;
    return [];
  }, [activePlainConversation, activePlainGroup]);

  const activeMessages = useMemo<Message[]>(() => {
    if (activeConversation) return activeConversation.messages;
    if (activeGroupProjection) return activeGroupProjection.activeMessages;
    return plainActiveMessages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderDeviceId: m.senderId,
      content: m.content,
      type: m.type === "text" ? "text" as const : m.type === "call" ? "call" as const : "attachment" as const,
      call: m.call,
      attachment: m.attachment
        ? {
            attachmentId: m.attachment.attachmentId,
            key: "",
            digest: "",
            mimeType: m.attachment.contentType,
            fileName: m.attachment.fileName,
            size: m.attachment.size,
            kind: (["voice_note", "video_note"].includes(m.type) ? m.type : "file") as "file" | "voice_note" | "video_note",
            durationMs: m.attachment.durationMs,
            mediaGroupId: m.attachment.mediaGroupId,
            isPlain: true,
            localUrl: m.attachment.localUrl,
            uploadProgress: m.uploadProgress,
          }
        : undefined,
      timestamp: m.timestamp,
      status: m.status,
      isOwn: m.isOwn,
      replyTo: m.replyTo,
    }));
  }, [activeConversation, activeGroupProjection, plainActiveMessages]);

  const plainGroupSenderLabels = useMemo<Record<string, string>>(() => {
    if (!activePlainGroup) return {};
    const labels: Record<string, string> = {};
    for (const msg of activePlainGroup.messages) {
      if (!msg.isOwn) {
        labels[msg.id] = msg.senderName;
      }
    }
    return labels;
  }, [activePlainGroup]);

  const groupSenderLabels =
    activeGroupProjection?.senderLabels ?? (activePlainGroup ? plainGroupSenderLabels : undefined);

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
    activePlainConversation,
    activePlainConversationId,
    activePlainGroup,
    activePlainGroupId,
    plainActivePresence,
    plainConversationEntries,
    plainGroupEntries,
    sendPlainText,
    sendPlainAttachment,
    createPlainGroup,
    sendPlainGroupText,
    sendPlainGroupAttachment,
    ensurePlainConversation,
  };
}

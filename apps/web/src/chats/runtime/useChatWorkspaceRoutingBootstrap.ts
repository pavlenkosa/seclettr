import { useEffect, type Dispatch, type SetStateAction } from "react";
import { api } from "@/lib/api";
import { sanitizeDisplayTextOrFallback } from "@/lib/display-text";
import { logger } from "@/lib/logger.js";
import { useChatThreadRouting } from "./useChatThreadRouting";

interface UseChatWorkspaceRoutingBootstrapOptions {
  conversations: Record<string, unknown>;
  activeConversationId: string | null;
  activeGroupId: string | null;
  setActiveConversation: (userId: string | null) => void;
  setActiveGroup: (groupId: string | null) => void;
  loadGroupMessages: (groupId: string) => Promise<void>;
  getGroupsState: () => {
    groups: Record<string, unknown>;
    activeGroupId: string | null;
  };
  plainConversations: Record<string, unknown>;
  activePlainConversationId: string | null;
  activePlainGroupId: string | null;
  setActivePlainConversation: Dispatch<SetStateAction<string | null>>;
  setActivePlainGroup: Dispatch<SetStateAction<string | null>>;
  loadPlainGroupMessages: (groupId: string) => Promise<void>;
  savedThreadActive: boolean;
  setSavedThreadActive: Dispatch<SetStateAction<boolean>>;
  setMobileShowConversation: Dispatch<SetStateAction<boolean>>;
  setMobileCreateMenuOpen: Dispatch<SetStateAction<boolean>>;
  upsertConversation: (conversation: {
    userId: string;
    username: string;
    messages: [];
    lastMessageAt: number;
    unreadCount: number;
  }) => void;
  upsertPlainConversation: (conversation: { userId: string; username: string }) => void;
}

/**
 * Owns thread-route activation plus direct/plain-direct deep-link bootstrap
 * without pulling message projection or saved-thread shaping into the same
 * runtime slice.
 */
export function useChatWorkspaceRoutingBootstrap(
  options: UseChatWorkspaceRoutingBootstrapOptions
) {
  const {
    conversations,
    activeConversationId,
    activeGroupId,
    setActiveConversation,
    setActiveGroup,
    loadGroupMessages,
    getGroupsState,
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
  } = options;

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
    getGroupsState,
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

  return {
    handleBack,
    handleSelectThread,
  };
}

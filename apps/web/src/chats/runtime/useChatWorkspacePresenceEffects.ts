import { useEffect } from "react";
import { useCallback } from "react";
import type { Conversation } from "@/stores/messages";
import { useMessagesStore } from "@/stores/messages";
import type { PlainConversation } from "@/stores/plain";
import { usePlainMessagesStore } from "@/stores/plain";

interface UseChatWorkspacePresenceEffectsOptions {
  activeConversation: Conversation | null;
  activePlainConversation: PlainConversation | null;
  fetchUserPresence: (userId: string) => Promise<void>;
  loadPlainHistory: (userId: string, username: string) => Promise<void>;
  markConversationRead: (userId: string) => Promise<void>;
}

/**
 * Owns active-thread presence polling plus read/history side effects for
 * direct and plain-direct workspace threads without touching routing or
 * projection logic.
 */
export function useChatWorkspacePresenceEffects(
  options: UseChatWorkspacePresenceEffectsOptions
) {
  const {
    activeConversation,
    activePlainConversation,
    fetchUserPresence,
    loadPlainHistory,
    markConversationRead,
  } = options;

  const activeConversationUserId = activeConversation?.userId ?? null;

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
          ? (
            state.typingByUser[activeConversationUserId]?.typing
            && (state.typingByUser[activeConversationUserId]?.chatKind ?? "e2ee") === "e2ee"
          )
          : false
      ),
      [activeConversationUserId]
    )
  );

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
  // Plain chats have no server-side typing signal infrastructure — always false.
  const plainActiveTyping = false;

  useEffect(() => {
    if (!activePlainConversation || activePlainConversation.historyLoaded) return;
    void loadPlainHistory(
      activePlainConversation.userId,
      activePlainConversation.username
    );
  }, [
    activePlainConversation?.historyLoaded,
    activePlainConversation?.userId,
    activePlainConversation?.username,
    loadPlainHistory,
  ]);

  useEffect(() => {
    if (!activePlainConversation?.historyLoaded) return;
    if (activePlainConversation.unreadCount === 0) return;
    usePlainMessagesStore.getState().markRead(activePlainConversation.userId);
  }, [
    activePlainConversation?.historyLoaded,
    activePlainConversation?.unreadCount,
    activePlainConversation?.userId,
  ]);

  useEffect(() => {
    if (!plainPeerUserId) return;
    void fetchUserPresence(plainPeerUserId);
    const refreshTimer = setInterval(() => {
      void fetchUserPresence(plainPeerUserId);
    }, 30_000);
    return () => clearInterval(refreshTimer);
  }, [plainPeerUserId, fetchUserPresence]);

  return {
    activePresence,
    activeTyping,
    plainActivePresence,
    plainActiveTyping,
  };
}

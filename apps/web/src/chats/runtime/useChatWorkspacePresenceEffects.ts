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
  const plainHistoryLoaded = activePlainConversation?.historyLoaded ?? false;
  const plainUnreadCount = activePlainConversation?.unreadCount ?? 0;
  const plainPeerUsername = activePlainConversation?.username ?? "";

  const plainActivePresence = useMessagesStore(
    useCallback(
      (state) => (plainPeerUserId ? state.presenceByUser[plainPeerUserId] : undefined),
      [plainPeerUserId]
    )
  );
  const plainActiveTyping = false;

  useEffect(() => {
    if (!plainPeerUserId || plainHistoryLoaded) return;
    void loadPlainHistory(plainPeerUserId, plainPeerUsername);
  }, [plainPeerUserId, plainHistoryLoaded, plainPeerUsername, loadPlainHistory]);

  useEffect(() => {
    if (!plainPeerUserId || !plainHistoryLoaded) return;
    if (plainUnreadCount === 0) return;
    usePlainMessagesStore.getState().markRead(plainPeerUserId);
  }, [plainPeerUserId, plainHistoryLoaded, plainUnreadCount]);

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

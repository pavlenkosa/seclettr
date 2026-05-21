import { useCallback } from "react";
import { usePlainMessagesStore } from "@/stores/plain";

type ActiveThreadKind =
  | "direct"
  | "group"
  | "plain-direct"
  | "plain-group"
  | "saved"
  | null;

type PlainConversationSummary = {
  userId: string;
  username: string;
};

type UseChatWorkspaceThreadActionsOptions = {
  plainConversations: Record<string, PlainConversationSummary>;
  activeThreadKind: ActiveThreadKind;
  activeConversationUserId: string | null;
  activeGroupId: string | null;
  activePlainConversationId: string | null;
  activePlainGroupId: string | null;
  retryDirectMessage: (conversationId: string, messageId: string) => Promise<unknown>;
  retryGroupMessage: (groupId: string, messageId: string) => Promise<unknown>;
};

/**
 * useChatWorkspaceThreadActions — workspace-local thread helper bundle.
 *
 * Owns:
 *   - plain direct placeholder/upsert helpers used by routing and creation flows
 *   - retry routing by active thread kind
 *
 * Does not own routing/bootstrap, presence side effects, projection, or
 * group-call workspace integration.
 */
export function useChatWorkspaceThreadActions({
  plainConversations,
  activeThreadKind,
  activeConversationUserId,
  activeGroupId,
  activePlainConversationId,
  activePlainGroupId,
  retryDirectMessage,
  retryGroupMessage,
}: UseChatWorkspaceThreadActionsOptions) {
  const upsertPlainConversation = useCallback(
    (conversation: { userId: string; username: string }) => {
      usePlainMessagesStore.setState((state) => {
        if (state.conversations[conversation.userId]) return state;
        return {
          conversations: {
            ...state.conversations,
            [conversation.userId]: {
              userId: conversation.userId,
              username: conversation.username,
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

  const ensurePlainConversation = useCallback(
    (peerUserId: string, peerUsername: string) => {
      if (!plainConversations[peerUserId]) {
        usePlainMessagesStore.setState((state) => ({
          conversations: {
            ...state.conversations,
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
        return;
      }
      if (activeThreadKind === "plain-group" && activePlainGroupId) {
        return;
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
    ]
  );

  return {
    upsertPlainConversation,
    ensurePlainConversation,
    handleRetryMessage,
  };
}

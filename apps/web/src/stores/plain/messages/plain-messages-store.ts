import { create } from "zustand";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/websocket";
import { useAuthStore } from "@/stores/auth";
import type { PlainConversation, PlainReplyMeta } from "../types";
import { createPlainMessagesSendRuntime } from "./plain-messages-send-runtime";
import { createPlainMessagesLiveRuntime } from "./plain-messages-live-runtime";
import { createPlainMessagesLocalEventsRuntime } from "./plain-messages-local-events-runtime";
import { createPlainMessagesHistoryRuntime } from "./plain-messages-history-runtime";
import { createPlainMessagesAttachmentRuntime } from "./plain-messages-attachment-runtime";

// ─── Store state / actions ────────────────────────────────────────────────────

export interface PlainMessagesState {
  conversations: Record<string, PlainConversation>;
  wsConnected: boolean;

  /** Fetch list of all plain DM peers and seed conversation stubs */
  loadConversationList: () => Promise<void>;
  /** Load paginated history for a DM conversation */
  loadHistory: (userId: string, username: string) => Promise<void>;
  /** Load next page (older messages) */
  loadMoreHistory: (userId: string) => Promise<void>;

  /** Send a text message */
  sendText: (
    recipientUserId: string,
    recipientUsername: string,
    content: string,
    replyTo?: PlainReplyMeta
  ) => Promise<void>;

  /** Send a file/voice/video attachment */
  sendAttachment: (
    recipientUserId: string,
    recipientUsername: string,
    file: File,
    opts?: {
      kind?: "voice_note" | "video_note" | "file";
      durationMs?: number;
      mediaGroupId?: string;
      caption?: string;
      replyTo?: PlainReplyMeta;
    }
  ) => Promise<void>;

  /** Edit a sent text message */
  editMessage: (conversationUserId: string, messageId: string, content: string) => Promise<void>;

  /** Delete a message */
  deleteMessage: (conversationUserId: string, messageId: string) => Promise<void>;

  /** Delete an entire DM conversation (soft-deletes all messages for both sides) */
  deleteConversation: (peerUserId: string) => Promise<void>;

  /** Record a completed call into the conversation history (local only, not persisted) */
  recordCallEvent: (params: {
    userId: string;
    username: string;
    mode: "audio" | "video";
    direction: "inbound" | "outbound";
    outcome: "ended" | "declined" | "missed";
    durationSec?: number;
  }) => void;
  /** Mark conversation as read (reset unreadCount) */
  markRead: (userId: string) => void;

  /** Subscribe to WS events and connection changes — call once on mount */
  subscribe: () => () => void;

  /** Reset on logout */
  reset: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePlainMessagesStore = create<PlainMessagesState>((set, get) => {
  function getMyUserId(): string | null {
    return useAuthStore.getState().userId;
  }
  function getMyUsername(): string | null {
    return useAuthStore.getState().username;
  }
  function getMyDeviceId(): string {
    return useAuthStore.getState().deviceId ?? "unknown";
  }

  function conversationKeyFor(otherUserId: string): string {
    return otherUserId;
  }

  const { sendText, editMessage, deleteMessage } = createPlainMessagesSendRuntime({
    set,
    getMyUserId,
    getMyUsername,
    conversationKeyFor,
  });

  const { subscribe } = createPlainMessagesLiveRuntime({ set, get, getMyUserId });

  const { recordCallEvent, markRead, reset } = createPlainMessagesLocalEventsRuntime({
    set,
    getMyUserId,
    getMyUsername,
    conversationKeyFor,
  });

  const { loadConversationList, loadHistory, loadMoreHistory } = createPlainMessagesHistoryRuntime({
    set,
    get,
    getMyUserId,
    getMyUsername,
    getMyDeviceId,
    conversationKeyFor,
  });

  const { sendAttachment } = createPlainMessagesAttachmentRuntime({
    set,
    getMyUserId,
    getMyUsername,
    conversationKeyFor,
  });

  async function deleteConversation(peerUserId: string) {
    await api.delete(`/plain/conversations/${encodeURIComponent(peerUserId)}`);
    // Remove from local store immediately
    set((state) => {
      const next = { ...state.conversations };
      delete next[conversationKeyFor(peerUserId)];
      return { conversations: next };
    });
  }

  return {
    conversations: {},
    wsConnected: wsClient.connected,
    loadConversationList,
    loadHistory,
    loadMoreHistory,
    sendText,
    sendAttachment,
    editMessage,
    deleteMessage,
    deleteConversation,
    recordCallEvent,
    markRead,
    subscribe,
    reset,
  };
});

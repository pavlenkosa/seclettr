import { create } from "zustand";
import { wsClient } from "@/lib/websocket";
import { useAuthStore } from "@/stores/auth";
import type {
  PlainGroup,
  PlainReplyMeta,
} from "../types";
import {
  wireToPlainGroup,
  type WireGroupHistoryResponse,
  type WireGroupListResponse,
  type WirePlainGroup,
} from "./plain-groups-wire";
import { createPlainGroupsAttachmentRuntime } from "./plain-groups-attachment-runtime";
import { createPlainGroupsHistoryRuntime } from "./plain-groups-history-runtime";
import { createPlainGroupsLiveRuntime } from "./plain-groups-live-runtime";
import { createPlainGroupsLocalEventsRuntime } from "./plain-groups-local-events-runtime";
import { createPlainGroupsMembershipRuntime } from "./plain-groups-membership-runtime";
import { createPlainGroupsSendRuntime } from "./plain-groups-send-runtime";

// ─── Store state / actions ────────────────────────────────────────────────────

export interface PlainGroupsState {
  groups: Record<string, PlainGroup>;
  loadingGroups: boolean;
  wsConnected: boolean;

  /** Load all groups for current user */
  loadGroups: () => Promise<void>;
  /** Load paginated message history for a group */
  loadHistory: (groupId: string) => Promise<void>;
  /** Load next page (older messages) */
  loadMoreHistory: (groupId: string) => Promise<void>;

  /** Create a new plain group */
  createGroup: (name: string, memberUserIds: string[]) => Promise<string>;
  /** Rename group (owner / admin only). */
  renameGroup: (groupId: string, name: string) => Promise<void>;
  /** Add a member */
  addMember: (groupId: string, userId: string) => Promise<void>;
  /** Remove a member (or leave) */
  removeMember: (groupId: string, userId: string) => Promise<void>;
  /** Change a member's role. Owner-only on the server. */
  updateMemberRole: (groupId: string, userId: string, role: "owner" | "admin" | "member") => Promise<void>;

  /** Send a text message */
  sendText: (groupId: string, content: string, replyTo?: PlainReplyMeta) => Promise<void>;
  /** Send a file/voice/video attachment */
  sendAttachment: (
    groupId: string,
    file: File,
    opts?: {
      kind?: "voice_note" | "video_note" | "file";
      durationMs?: number;
      mediaGroupId?: string;
      caption?: string;
      replyTo?: PlainReplyMeta;
    }
  ) => Promise<void>;

  /** Edit a message */
  editMessage: (groupId: string, messageId: string, content: string) => Promise<void>;
  /** Delete a message */
  deleteMessage: (groupId: string, messageId: string) => Promise<void>;

  /** Mark group as read */
  markRead: (groupId: string) => void;

  /** Subscribe to WS events */
  subscribe: () => () => void;

  /** Reset on logout */
  reset: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePlainGroupsStore = create<PlainGroupsState>((set, get) => {
  function getMyUserId(): string | null {
    return useAuthStore.getState().userId;
  }

  function getMyUsername(): string | null {
    return useAuthStore.getState().username;
  }

  const { loadGroups, loadHistory, loadMoreHistory } = createPlainGroupsHistoryRuntime({
    set,
    get,
    getMyUserId,
  });

  const { createGroup, renameGroup, addMember, removeMember, updateMemberRole } =
    createPlainGroupsMembershipRuntime({ set, get, getMyUserId });
  const { sendText, editMessage, deleteMessage } = createPlainGroupsSendRuntime({
    set,
    getMyUserId,
    getMyUsername,
  });
  const { sendAttachment } = createPlainGroupsAttachmentRuntime({
    set,
    getMyUserId,
    getMyUsername,
  });
  const { subscribe } = createPlainGroupsLiveRuntime({
    set,
    getMyUserId,
  });
  const { markRead, reset } = createPlainGroupsLocalEventsRuntime({
    set,
  });

  return {
    groups: {},
    loadingGroups: false,
    wsConnected: wsClient.connected,
    loadGroups,
    loadHistory,
    loadMoreHistory,
    createGroup,
    renameGroup,
    addMember,
    removeMember,
    updateMemberRole,
    sendText,
    sendAttachment,
    editMessage,
    deleteMessage,
    markRead,
    subscribe,
    reset,
  };
});

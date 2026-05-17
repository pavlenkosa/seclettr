import { create } from "zustand";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/websocket";
import { useAuthStore } from "@/stores/auth";
import { logger } from "@/lib/logger";
import { PLAIN_PROTOCOL_VERSION } from "@seclettr/protocol";
import type {
  PlainGroup,
  PlainMessage,
  PlainMessageType,
  PlainReplyMeta,
} from "./types";
import {
  mergeGroupMessage,
  wireToPlainGroup,
  wireToPlainGroupMessage,
  type WireConfirmUploadResponse,
  type WireGroupHistoryResponse,
  type WireGroupListResponse,
  type WireInitUploadResponse,
  type WirePlainGroup,
  type WirePlainGroupMessage,
  type WireSendResponse,
} from "./plain-groups-wire";
import { createPlainGroupsHistoryRuntime } from "./plain-groups-history-runtime";
import { createPlainGroupsMembershipRuntime } from "./plain-groups-membership-runtime";

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

  const { loadGroups, loadHistory, loadMoreHistory } = createPlainGroupsHistoryRuntime({
    set,
    get,
    getMyUserId,
  });

  const { createGroup, renameGroup, addMember, removeMember, updateMemberRole } =
    createPlainGroupsMembershipRuntime({ set, get, getMyUserId });

  async function sendText(groupId: string, content: string, replyTo?: PlainReplyMeta): Promise<void> {
    const myUserId = getMyUserId();
    const myUsername = useAuthStore.getState().username;
    if (!myUserId || !myUsername) return;

    const clientId = crypto.randomUUID();
    const optimistic: PlainMessage = {
      id: clientId,
      clientId,
      senderId: myUserId,
      senderName: myUsername,
      content,
      type: "text",
      replyTo,
      timestamp: Date.now(),
      isOwn: true,
      status: "sending",
    };

    set((state) => ({ groups: mergeGroupMessage(state.groups, groupId, optimistic) }));

    try {
      await api.post<WireSendResponse>(
        `/plain/groups/${encodeURIComponent(groupId)}/messages`,
        {
          version: PLAIN_PROTOCOL_VERSION,
          clientId,
          content,
          messageType: "text",
          replyToId: replyTo?.id,
        }
      );
    } catch (err) {
      logger.error("[PlainGroups] sendText failed", err);
      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              messages: g.messages.map((m) =>
                m.clientId === clientId ? { ...m, status: "error" as const } : m
              ),
            },
          },
        };
      });
    }
  }

  async function sendAttachment(
    groupId: string,
    file: File,
    opts: {
      kind?: "voice_note" | "video_note" | "file";
      durationMs?: number;
      mediaGroupId?: string;
      caption?: string;
      replyTo?: PlainReplyMeta;
    } = {}
  ): Promise<void> {
    const myUserId = getMyUserId();
    const myUsername = useAuthStore.getState().username;
    if (!myUserId || !myUsername) return;

    const kind = opts.kind ?? "file";
    const messageType: PlainMessageType =
      kind === "voice_note" ? "voice_note" : kind === "video_note" ? "video_note" : "attachment";

    const clientId = crypto.randomUUID();
    const localUrl = URL.createObjectURL(file);

    const optimistic: PlainMessage = {
      id: clientId,
      clientId,
      senderId: myUserId,
      senderName: myUsername,
      content: opts.caption ?? "",
      type: messageType,
      attachment: {
        attachmentId: "",
        contentType: file.type,
        fileName: file.name,
        size: file.size,
        durationMs: opts.durationMs,
        mediaGroupId: opts.mediaGroupId,
        localUrl,
      },
      replyTo: opts.replyTo,
      timestamp: Date.now(),
      isOwn: true,
      status: "sending",
      uploadProgress: 0,
    };

    set((state) => ({ groups: mergeGroupMessage(state.groups, groupId, optimistic) }));

    function setProgress(progress: number) {
      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              messages: g.messages.map((m) =>
                m.clientId === clientId ? { ...m, uploadProgress: progress } : m
              ),
            },
          },
        };
      });
    }

    let initializedAttachmentId: string | null = null;

    try {
      const initResp = await api.post<WireInitUploadResponse>("/plain/attachments/init", {
        size: file.size,
        contentType: file.type,
        fileName: file.name,
      });
      const { attachmentId, uploadUrl, uploadFields } = initResp;
      initializedAttachmentId = attachmentId;

      if (uploadFields && Object.keys(uploadFields).length > 0) {
        const formData = new FormData();
        for (const [k, v] of Object.entries(uploadFields)) formData.append(k, v);
        formData.append("file", file);
        const xhr = new XMLHttpRequest();
        await new Promise<void>((resolve, reject) => {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 90));
          };
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 ${xhr.status}`)));
          xhr.onerror = () => reject(new Error("Upload network error"));
          xhr.open("POST", uploadUrl);
          xhr.send(formData);
        });
      } else {
        const xhr = new XMLHttpRequest();
        await new Promise<void>((resolve, reject) => {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 90));
          };
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload ${xhr.status}`)));
          xhr.onerror = () => reject(new Error("Upload network error"));
          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.send(file);
        });
      }

      setProgress(92);
      const confirmResp = await api.post<WireConfirmUploadResponse>(
        `/plain/attachments/${encodeURIComponent(attachmentId)}/confirm`
      );
      setProgress(96);

      await api.post<WireSendResponse>(
        `/plain/groups/${encodeURIComponent(groupId)}/messages`,
        {
          version: PLAIN_PROTOCOL_VERSION,
          clientId,
          content: opts.caption ?? "",
          messageType,
          attachmentId,
          durationMs: opts.durationMs,
          mediaGroupId: opts.mediaGroupId,
          replyToId: opts.replyTo?.id,
        }
      );

      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              messages: g.messages.map((m) =>
                m.clientId === clientId
                  ? {
                      ...m,
                      status: "sent" as const,
                      uploadProgress: undefined,
                      attachment: m.attachment
                        ? { ...m.attachment, attachmentId, localUrl: confirmResp.downloadUrl }
                        : undefined,
                    }
                  : m
              ),
            },
          },
        };
      });

      // Keep the optimistic object URL alive briefly after the message becomes
      // sent. The sender-side player may already have loaded it before the
      // store swaps `localUrl` to the confirmed download URL; revoking it
      // synchronously makes Chrome fail with ERR_FILE_NOT_FOUND until reload.
      window.setTimeout(() => URL.revokeObjectURL(localUrl), 30_000);
      initializedAttachmentId = null;
    } catch (err) {
      logger.error("[PlainGroups] sendAttachment failed", err);
      if (initializedAttachmentId) {
        api.delete(`/plain/attachments/${encodeURIComponent(initializedAttachmentId)}`)
          .catch((cleanupErr) => logger.warn("[PlainGroups] cancel orphan attachment failed", cleanupErr));
      }
      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              messages: g.messages.map((m) =>
                m.clientId === clientId
                  ? { ...m, status: "error" as const, uploadProgress: undefined }
                  : m
              ),
            },
          },
        };
      });
    }
  }

  async function editMessage(groupId: string, messageId: string, content: string): Promise<void> {
    try {
      await api.patch(
        `/plain/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}`,
        { content }
      );
      const now = Date.now();
      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              messages: g.messages.map((m) =>
                m.id === messageId ? { ...m, content, editedAt: now } : m
              ),
            },
          },
        };
      });
    } catch (err) {
      logger.error("[PlainGroups] editMessage failed", err);
    }
  }

  async function deleteMessage(groupId: string, messageId: string): Promise<void> {
    try {
      await api.delete(
        `/plain/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}`
      );
      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              messages: g.messages.filter((m) => m.id !== messageId),
            },
          },
        };
      });
    } catch (err) {
      logger.error("[PlainGroups] deleteMessage failed", err);
    }
  }

  function markRead(groupId: string): void {
    set((state) => {
      const g = state.groups[groupId];
      if (!g || g.unreadCount === 0) return state;
      return { groups: { ...state.groups, [groupId]: { ...g, unreadCount: 0 } } };
    });
  }

  function handleIncomingWsEvent(message: { type: string; [k: string]: unknown }): void {
    const myUserId = getMyUserId();
    if (!myUserId) return;

    if (message.type === "plain_message.new") {
      const wire = message.message as WirePlainGroupMessage;
      if (!wire.groupId) return;
      const msg = wireToPlainGroupMessage(wire, myUserId);
      set((state) => ({ groups: mergeGroupMessage(state.groups, wire.groupId!, msg) }));
      return;
    }

    if (message.type === "plain_message.edited") {
      const { messageId, content, editedAt, threadKey, threadKind } = message as unknown as {
        messageId: string;
        content: string;
        editedAt: string;
        threadKey: string;
        threadKind: string;
      };
      if (threadKind !== "group") return;
      const editedAtMs = new Date(editedAt).getTime();
      set((state) => {
        const g = state.groups[threadKey];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [threadKey]: {
              ...g,
              messages: g.messages.map((m) =>
                m.id === messageId ? { ...m, content, editedAt: editedAtMs } : m
              ),
            },
          },
        };
      });
      return;
    }

    if (message.type === "plain_message.deleted") {
      const { messageId, threadKey, threadKind } = message as unknown as {
        messageId: string;
        threadKey: string;
        threadKind: string;
      };
      if (threadKind !== "group") return;
      set((state) => {
        const g = state.groups[threadKey];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [threadKey]: {
              ...g,
              messages: g.messages.filter((m) => m.id !== messageId),
            },
          },
        };
      });
    }
  }

  function subscribe(): () => void {
    const unsubscribeMessages = wsClient.on((message) => {
      if (
        message.type === "plain_message.new" ||
        message.type === "plain_message.edited" ||
        message.type === "plain_message.deleted"
      ) {
        handleIncomingWsEvent(message as unknown as { type: string; [k: string]: unknown });
      }
    });

    const unsubscribeConnection = wsClient.onConnectionChange((connected) => {
      set({ wsConnected: connected });
    });

    return () => {
      unsubscribeMessages();
      unsubscribeConnection();
    };
  }

  function reset(): void {
    set({ groups: {}, loadingGroups: false, wsConnected: wsClient.connected });
  }

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

import { create } from "zustand";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/websocket";
import { useAuthStore } from "@/stores/auth";
import { logger } from "@/lib/logger";
import { PLAIN_PROTOCOL_VERSION } from "@seclettr/protocol";
import type {
  PlainGroup,
  PlainGroupMember,
  PlainMessage,
  PlainMessageType,
  PlainReplyMeta,
} from "./types";

// ─── Wire shapes ──────────────────────────────────────────────────────────────

interface WirePlainGroupMessage {
  id: string;
  clientId: string;
  senderUserId: string;
  senderUsername: string;
  groupId?: string;
  content: string;
  messageType: string;
  attachment?: {
    attachmentId: string;
    contentType: string;
    fileName?: string;
    size: number;
    durationMs?: number;
    mediaGroupId?: string;
  };
  replyTo?: { id: string; content: string; senderName?: string };
  createdAt: string;
  editedAt?: string;
}

interface WireGroupHistoryResponse {
  messages: WirePlainGroupMessage[];
  hasMore: boolean;
  nextCursor?: string;
}

interface WireGroupMember {
  userId: string;
  username: string;
  role: string;
  joinedAt: string;
}

interface WirePlainGroup {
  id: string;
  name: string;
  creatorId: string;
  members: WireGroupMember[];
  createdAt: string;
  updatedAt: string;
}

interface WireGroupListResponse {
  groups: WirePlainGroup[];
}

interface WireSendResponse {
  id: string;
  clientId: string;
  createdAt: string;
}

interface WireInitUploadResponse {
  attachmentId: string;
  uploadUrl: string;
  uploadFields?: Record<string, string>;
  expiresAt: string;
}

interface WireConfirmUploadResponse {
  attachmentId: string;
  downloadUrl: string;
}

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
  /** Add a member */
  addMember: (groupId: string, userId: string) => Promise<void>;
  /** Remove a member (or leave) */
  removeMember: (groupId: string, userId: string) => Promise<void>;

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wireToPlainGroupMessage(wire: WirePlainGroupMessage, myUserId: string): PlainMessage {
  return {
    id: wire.id,
    clientId: wire.clientId,
    senderId: wire.senderUserId,
    senderName: wire.senderUsername,
    content: wire.content,
    type: wire.messageType as PlainMessageType,
    attachment: wire.attachment
      ? {
          attachmentId: wire.attachment.attachmentId,
          contentType: wire.attachment.contentType,
          fileName: wire.attachment.fileName,
          size: wire.attachment.size,
          durationMs: wire.attachment.durationMs,
          mediaGroupId: wire.attachment.mediaGroupId,
        }
      : undefined,
    replyTo: wire.replyTo,
    timestamp: new Date(wire.createdAt).getTime(),
    editedAt: wire.editedAt ? new Date(wire.editedAt).getTime() : undefined,
    isOwn: wire.senderUserId === myUserId,
    status: "sent",
  };
}

function wireToPlainGroup(wire: WirePlainGroup): PlainGroup {
  return {
    groupId: wire.id,
    name: wire.name,
    creatorId: wire.creatorId,
    members: wire.members.map((m) => ({
      userId: m.userId,
      username: m.username,
      role: m.role as PlainGroupMember["role"],
      joinedAt: m.joinedAt,
    })),
    messages: [],
    lastMessageAt: new Date(wire.updatedAt).getTime(),
    unreadCount: 0,
    hasMore: false,
    historyLoaded: false,
    createdAt: wire.createdAt,
    updatedAt: wire.updatedAt,
  };
}

function mergeGroupMessage(
  groups: Record<string, PlainGroup>,
  groupId: string,
  msg: PlainMessage
): Record<string, PlainGroup> {
  const group = groups[groupId];
  if (!group) return groups;

  const alreadyExists = group.messages.some(
    (m) => m.id === msg.id || m.clientId === msg.clientId
  );
  if (alreadyExists) {
    const messages = group.messages.map((m) =>
      m.clientId === msg.clientId
        ? { ...m, id: msg.id, status: "sent" as const, uploadProgress: undefined }
        : m
    );
    return {
      ...groups,
      [groupId]: {
        ...group,
        messages,
        lastMessageAt: Math.max(group.lastMessageAt, msg.timestamp),
      },
    };
  }

  return {
    ...groups,
    [groupId]: {
      ...group,
      messages: [...group.messages, msg],
      lastMessageAt: Math.max(group.lastMessageAt, msg.timestamp),
      unreadCount: msg.isOwn ? group.unreadCount : group.unreadCount + 1,
    },
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePlainGroupsStore = create<PlainGroupsState>((set, get) => {
  function getMyUserId(): string | null {
    return useAuthStore.getState().userId;
  }

  async function loadGroups(): Promise<void> {
    set({ loadingGroups: true });
    try {
      const data = await api.get<WireGroupListResponse>("/plain/groups");
      const groups: Record<string, PlainGroup> = {};
      for (const g of data.groups) {
        // Preserve existing messages if already loaded
        const existing = get().groups[g.id];
        groups[g.id] = {
          ...wireToPlainGroup(g),
          messages: existing?.messages ?? [],
          historyLoaded: existing?.historyLoaded ?? false,
          unreadCount: existing?.unreadCount ?? 0,
          nextCursor: existing?.nextCursor,
          hasMore: existing?.hasMore ?? false,
        };
      }
      set({ groups, loadingGroups: false });
    } catch (err) {
      logger.error("[PlainGroups] loadGroups failed", err);
      set({ loadingGroups: false });
    }
  }

  async function loadHistory(groupId: string): Promise<void> {
    const group = get().groups[groupId];
    if (group?.historyLoaded) return;

    try {
      const data = await api.get<WireGroupHistoryResponse>(
        `/plain/groups/${encodeURIComponent(groupId)}/messages?limit=50`
      );
      const myUserId = getMyUserId() ?? "";
      const messages = [...data.messages]
        .reverse()
        .map((w) => wireToPlainGroupMessage(w, myUserId));

      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              messages,
              lastMessageAt: messages.at(-1)?.timestamp ?? g.lastMessageAt,
              nextCursor: data.nextCursor,
              hasMore: data.hasMore,
              historyLoaded: true,
            },
          },
        };
      });
    } catch (err) {
      logger.error("[PlainGroups] loadHistory failed", err);
    }
  }

  async function loadMoreHistory(groupId: string): Promise<void> {
    const group = get().groups[groupId];
    if (!group?.hasMore || !group.nextCursor) return;

    try {
      const data = await api.get<WireGroupHistoryResponse>(
        `/plain/groups/${encodeURIComponent(groupId)}/messages?limit=50&before=${encodeURIComponent(group.nextCursor)}`
      );
      const myUserId = getMyUserId() ?? "";
      const older = [...data.messages].reverse().map((w) => wireToPlainGroupMessage(w, myUserId));

      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              messages: [...older, ...g.messages],
              nextCursor: data.nextCursor,
              hasMore: data.hasMore,
            },
          },
        };
      });
    } catch (err) {
      logger.error("[PlainGroups] loadMoreHistory failed", err);
    }
  }

  async function createGroup(name: string, memberUserIds: string[]): Promise<string> {
    const data = await api.post<WirePlainGroup>("/plain/groups", {
      version: PLAIN_PROTOCOL_VERSION,
      name,
      memberUserIds,
    });
    const group = wireToPlainGroup(data);
    set((state) => ({
      groups: { ...state.groups, [group.groupId]: group },
    }));
    return group.groupId;
  }

  async function addMember(groupId: string, userId: string): Promise<void> {
    await api.post(`/plain/groups/${encodeURIComponent(groupId)}/members`, { userId });
    // Reload group to get updated member list
    const data = await api.get<WirePlainGroup>(`/plain/groups/${encodeURIComponent(groupId)}`);
    const updated = wireToPlainGroup(data);
    set((state) => {
      const existing = state.groups[groupId];
      if (!existing) return state;
      return {
        groups: {
          ...state.groups,
          [groupId]: {
            ...existing,
            members: updated.members,
          },
        },
      };
    });
  }

  async function removeMember(groupId: string, userId: string): Promise<void> {
    await api.delete(
      `/plain/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`
    );
    const myUserId = getMyUserId();
    if (userId === myUserId) {
      // Left group — remove from store
      set((state) => {
        const { [groupId]: _removed, ...rest } = state.groups;
        return { groups: rest };
      });
    } else {
      set((state) => {
        const g = state.groups[groupId];
        if (!g) return state;
        return {
          groups: {
            ...state.groups,
            [groupId]: {
              ...g,
              members: g.members.filter((m) => m.userId !== userId),
            },
          },
        };
      });
    }
  }

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

      URL.revokeObjectURL(localUrl);
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
    addMember,
    removeMember,
    sendText,
    sendAttachment,
    editMessage,
    deleteMessage,
    markRead,
    subscribe,
    reset,
  };
});

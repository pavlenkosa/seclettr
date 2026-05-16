import { create } from "zustand";
import { api } from "@/lib/api";
import { wsClient } from "@/lib/websocket";
import { useAuthStore } from "@/stores/auth";
import { logger } from "@/lib/logger";
import { PLAIN_PROTOCOL_VERSION } from "@seclettr/protocol";
import type {
  PlainConversation,
  PlainMessage,
  PlainMessageType,
  PlainReplyMeta,
} from "./types";
import {
  cacheStorageKey,
  loadConversationsCache,
  saveConversationsCache,
} from "./plain-messages-cache";
import {
  mergeIncomingMessage,
  wireToPlainMessage,
  type WireConfirmUploadResponse,
  type WireHistoryResponse,
  type WireInitUploadResponse,
  type WirePlainMessage,
  type WireSendResponse,
} from "./plain-messages-wire";
import { createPlainMessagesSendRuntime } from "./plain-messages-send-runtime";

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

  async function loadConversationList(): Promise<void> {
    // Restore from encrypted cache immediately — visible before API responds
    const myUserId = getMyUserId() ?? "";
    const deviceId = getMyDeviceId();
    if (myUserId && deviceId !== "unknown") {
      const cached = await loadConversationsCache(myUserId, deviceId);
      if (Object.keys(cached).length > 0) {
        set((state) => ({
          conversations: {
            ...cached,
            ...state.conversations, // don't overwrite WS-received data
          },
        }));
      }
    }

    try {
      const data = await api.get<{
        conversations: Array<{
          peerUserId: string;
          peerUsername: string;
          lastMessageAt: string;
          lastMessageContent: string;
          lastMessageType: string;
          lastSenderUserId: string;
          unreadCount: number;
        }>;
      }>("/plain/conversations");

      const peers: Array<{ userId: string; username: string }> = [];

      set((state) => {
        const next = { ...state.conversations };
        for (const c of data.conversations) {
          const key = conversationKeyFor(c.peerUserId);
          const lastTs = new Date(c.lastMessageAt).getTime();
          peers.push({ userId: c.peerUserId, username: c.peerUsername });
          if (!next[key]) {
            const isOwnLast = c.lastSenderUserId === myUserId;
            const stub: PlainMessage = {
              id: `stub-${c.peerUserId}`,
              clientId: `stub-${c.peerUserId}`,
              senderId: c.lastSenderUserId,
              senderName: isOwnLast ? (getMyUsername() ?? "") : c.peerUsername,
              content: c.lastMessageContent,
              type: c.lastMessageType as PlainMessageType,
              timestamp: lastTs,
              isOwn: isOwnLast,
              status: "sent",
            };
            next[key] = {
              userId: c.peerUserId,
              username: c.peerUsername,
              messages: [stub],
              lastMessageAt: lastTs,
              unreadCount: c.unreadCount,
              hasMore: false,
              historyLoaded: false,
            };
          } else {
            // Update unread count from server even if conversation already exists
            next[key] = { ...next[key]!, unreadCount: c.unreadCount };
          }
        }
        return { conversations: next };
      });

      // Persist updated list to cache
      void saveConversationsCache(getMyUserId() ?? "", getMyDeviceId(), get().conversations);

      // Load full history for all conversations in background, 3 at a time
      void loadAllHistoriesBatched(peers);
    } catch (err) {
      logger.error("[PlainMsg] loadConversationList failed", err);
    }
  }

  async function loadAllHistoriesBatched(
    peers: Array<{ userId: string; username: string }>
  ): Promise<void> {
    const BATCH = 3;
    for (let i = 0; i < peers.length; i += BATCH) {
      await Promise.all(
        peers.slice(i, i + BATCH).map((p) => loadHistory(p.userId, p.username))
      );
    }
  }

  async function loadHistory(userId: string, username: string): Promise<void> {
    const key = conversationKeyFor(userId);
    const existing = get().conversations[key];
    if (existing?.historyLoaded) return;

    try {
      const data = await api.get<WireHistoryResponse>(
        `/plain/messages/${encodeURIComponent(userId)}?limit=50`
      );
      const myUserId = getMyUserId() ?? "";
      const messages = [...data.messages]
        .reverse()
        .map((w) => wireToPlainMessage(w, myUserId));

      set((state) => {
        const prev = state.conversations[key];
        return {
          conversations: {
            ...state.conversations,
            [key]: {
              userId,
              username: prev?.username ?? username,
              messages,
              lastMessageAt: messages.at(-1)?.timestamp ?? prev?.lastMessageAt ?? 0,
              unreadCount: prev?.unreadCount ?? 0,
              nextCursor: data.nextCursor,
              hasMore: data.hasMore,
              historyLoaded: true,
            },
          },
        };
      });
      void saveConversationsCache(getMyUserId() ?? "", getMyDeviceId(), get().conversations);
    } catch (err) {
      logger.error("[PlainMsg] loadHistory failed", err);
    }
  }

  async function loadMoreHistory(userId: string): Promise<void> {
    const key = conversationKeyFor(userId);
    const conv = get().conversations[key];
    if (!conv?.hasMore || !conv.nextCursor) return;

    try {
      const data = await api.get<WireHistoryResponse>(
        `/plain/messages/${encodeURIComponent(userId)}?limit=50&before=${encodeURIComponent(conv.nextCursor)}`
      );
      const myUserId = getMyUserId() ?? "";
      const older = [...data.messages].reverse().map((w) => wireToPlainMessage(w, myUserId));

      set((state) => {
        const existing = state.conversations[key];
        if (!existing) return state;
        return {
          conversations: {
            ...state.conversations,
            [key]: {
              ...existing,
              messages: [...older, ...existing.messages],
              nextCursor: data.nextCursor,
              hasMore: data.hasMore,
            },
          },
        };
      });
    } catch (err) {
      logger.error("[PlainMsg] loadMoreHistory failed", err);
    }
  }

  async function sendAttachment(
    recipientUserId: string,
    recipientUsername: string,
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
    const myUsername = getMyUsername();
    if (!myUserId || !myUsername) return;

    const kind = opts.kind ?? "file";
    const messageType: PlainMessageType =
      kind === "voice_note" ? "voice_note" : kind === "video_note" ? "video_note" : "attachment";

    const clientId = crypto.randomUUID();
    const key = conversationKeyFor(recipientUserId);
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

    set((state) => ({
      conversations: mergeIncomingMessage(
        state.conversations,
        key,
        optimistic,
        recipientUsername
      ),
    }));

    function setProgress(progress: number) {
      set((state) => {
        const conv = state.conversations[key];
        if (!conv) return state;
        return {
          conversations: {
            ...state.conversations,
            [key]: {
              ...conv,
              messages: conv.messages.map((m) =>
                m.clientId === clientId ? { ...m, uploadProgress: progress } : m
              ),
            },
          },
        };
      });
    }

    // Tracked across try/catch so a failure mid-flight can release the
    // server-side stub via DELETE /plain/attachments/:id instead of leaving
    // it for the 7-day retention sweep.
    let initializedAttachmentId: string | null = null;

    try {
      // 1. Init upload
      const initResp = await api.post<WireInitUploadResponse>("/plain/attachments/init", {
        size: file.size,
        contentType: file.type,
        fileName: file.name,
      });
      const { attachmentId, uploadUrl, uploadFields } = initResp;
      initializedAttachmentId = attachmentId;

      // 2. Upload to S3
      if (uploadFields && Object.keys(uploadFields).length > 0) {
        const formData = new FormData();
        for (const [k, v] of Object.entries(uploadFields)) {
          formData.append(k, v);
        }
        formData.append("file", file);
        const xhr = new XMLHttpRequest();
        await new Promise<void>((resolve, reject) => {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 90));
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`S3 upload failed: ${xhr.status}`));
          };
          xhr.onerror = () => reject(new Error("S3 upload network error"));
          xhr.open("POST", uploadUrl);
          xhr.send(formData);
        });
      } else {
        // Direct PUT
        const xhr = new XMLHttpRequest();
        await new Promise<void>((resolve, reject) => {
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 90));
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed: ${xhr.status}`));
          };
          xhr.onerror = () => reject(new Error("Upload network error"));
          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.send(file);
        });
      }

      setProgress(92);

      // 3. Confirm
      const confirmResp = await api.post<WireConfirmUploadResponse>(
        `/plain/attachments/${encodeURIComponent(attachmentId)}/confirm`
      );

      setProgress(96);

      // 4. Send message
      await api.post<WireSendResponse>(
        `/plain/messages/${encodeURIComponent(recipientUserId)}`,
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

      // Update optimistic message with real attachment info and download URL
      set((state) => {
        const conv = state.conversations[key];
        if (!conv) return state;
        return {
          conversations: {
            ...state.conversations,
            [key]: {
              ...conv,
              messages: conv.messages.map((m) =>
                m.clientId === clientId
                  ? {
                      ...m,
                      status: "sent" as const,
                      uploadProgress: undefined,
                      attachment: m.attachment
                        ? {
                            ...m.attachment,
                            attachmentId,
                            localUrl: confirmResp.downloadUrl,
                          }
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
      logger.error("[PlainMsg] sendAttachment failed", err);
      if (initializedAttachmentId) {
        // Best-effort cleanup so the orphan row + S3 object don't wait for
        // the retention sweep. A failure here is non-fatal — the sweep is
        // the safety net.
        api.delete(`/plain/attachments/${encodeURIComponent(initializedAttachmentId)}`)
          .catch((cleanupErr) => logger.warn("[PlainMsg] cancel orphan attachment failed", cleanupErr));
      }
      set((state) => {
        const conv = state.conversations[key];
        if (!conv) return state;
        return {
          conversations: {
            ...state.conversations,
            [key]: {
              ...conv,
              messages: conv.messages.map((m) =>
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

  function recordCallEvent({
    userId,
    username,
    mode,
    direction,
    outcome,
    durationSec,
  }: {
    userId: string;
    username: string;
    mode: "audio" | "video";
    direction: "inbound" | "outbound";
    outcome: "ended" | "declined" | "missed";
    durationSec?: number;
  }): void {
    const key = conversationKeyFor(userId);
    const myUserId = getMyUserId();
    const callMessage: PlainMessage = {
      id: `call-${crypto.randomUUID()}`,
      clientId: crypto.randomUUID(),
      senderId: direction === "outbound" ? (myUserId ?? userId) : userId,
      senderName: direction === "outbound" ? (getMyUsername() ?? "") : username,
      content: "",
      type: "call",
      call: {
        mode,
        direction,
        outcome,
        durationSec: Number.isFinite(durationSec) && (durationSec ?? 0) > 0 ? durationSec : undefined,
      },
      timestamp: Date.now(),
      isOwn: direction === "outbound",
      status: "sent",
    };

    set((state) => {
      const existing = state.conversations[key];
      const conv: PlainConversation = existing ?? {
        userId,
        username,
        messages: [],
        lastMessageAt: 0,
        unreadCount: 0,
        hasMore: false,
        historyLoaded: false,
      };
      return {
        conversations: {
          ...state.conversations,
          [key]: {
            ...conv,
            messages: [...conv.messages, callMessage],
            lastMessageAt: callMessage.timestamp,
          },
        },
      };
    });
  }

  function markRead(userId: string): void {
    const key = conversationKeyFor(userId);
    let hadUnread = false;
    set((state) => {
      const conv = state.conversations[key];
      if (!conv || conv.unreadCount === 0) return state;
      hadUnread = true;
      return {
        conversations: {
          ...state.conversations,
          [key]: { ...conv, unreadCount: 0 },
        },
      };
    });
    if (hadUnread) void sendReadReceipt(userId);
  }

  async function sendReadReceipt(peerUserId: string): Promise<void> {
    try {
      await api.post(`/plain/messages/${encodeURIComponent(peerUserId)}/read`, {});
    } catch (err) {
      logger.warn("[PlainMsg] sendReadReceipt failed", err);
    }
  }

  function handleIncomingWsEvent(message: { type: string; [k: string]: unknown }): void {
    const myUserId = getMyUserId();
    if (!myUserId) return;

    if (message.type === "plain_message.new") {
      const wire = message.message as WirePlainMessage;
      // Group messages are routed through the same plain_message.new event but
      // owned by plain-groups-store. Skip them here so the same message doesn't
      // also land in the sender's DM thread.
      if (wire.groupId) return;
      const conversationKey = wire.senderUserId === myUserId
        ? (wire.recipientUserId ?? "")
        : wire.senderUserId;
      if (!conversationKey) return;

      const msg = wireToPlainMessage(wire, myUserId);
      const peerUsername = wire.senderUserId === myUserId
        ? (get().conversations[conversationKey]?.username ?? wire.recipientUsername ?? conversationKey)
        : wire.senderUsername;

      set((state) => ({
        conversations: mergeIncomingMessage(
          state.conversations,
          conversationKey,
          msg,
          peerUsername
        ),
      }));
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
      if (threadKind !== "dm") return;
      const editedAtMs = new Date(editedAt).getTime();
      set((state) => {
        const conv = state.conversations[threadKey];
        if (!conv) return state;
        return {
          conversations: {
            ...state.conversations,
            [threadKey]: {
              ...conv,
              messages: conv.messages.map((m) =>
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
      if (threadKind !== "dm") return;
      set((state) => {
        const conv = state.conversations[threadKey];
        if (!conv) return state;
        return {
          conversations: {
            ...state.conversations,
            [threadKey]: {
              ...conv,
              messages: conv.messages.filter((m) => m.id !== messageId),
            },
          },
        };
      });
      return;
    }

    if (message.type === "plain_message.read") {
      // Peer read our messages — update status to "read" for the affected thread
      const { messageIds, threadKey } = message as unknown as {
        messageIds: string[];
        threadKey: string;
      };
      const idSet = new Set(messageIds);
      set((state) => {
        const conv = state.conversations[threadKey];
        if (!conv) return state;
        const messages: PlainMessage[] = conv.messages.map((m) =>
          m.isOwn && idSet.has(m.id) ? { ...m, status: "read" as PlainMessage["status"] } : m
        );
        return {
          conversations: {
            ...state.conversations,
            [threadKey]: { ...conv, messages },
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
        message.type === "plain_message.deleted" ||
        message.type === "plain_message.read"
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
    const myUserId = getMyUserId();
    if (myUserId) {
      try { localStorage.removeItem(cacheStorageKey(myUserId)); } catch { /* ignore */ }
    }
    set({
      conversations: {},
      wsConnected: wsClient.connected,
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
    recordCallEvent,
    markRead,
    subscribe,
    reset,
  };
});

import type { PlainConversation, PlainMessage, PlainMessageType } from "./types";

/**
 * Wire/projection layer for the plain DM store.
 *
 * Owns the API wire shapes and the two pure transforms extracted from
 * `plain-messages-store.ts`:
 *  - `wireToPlainMessage` — normalizes an API/WS wire message into the local
 *    `PlainMessage` shape;
 *  - `mergeIncomingMessage` — dedupe + optimistic reconciliation for a single
 *    conversation.
 *
 * Both functions are pure (no `set/get`, no I/O) so the store and its tests can
 * reason about reconciliation in isolation. Behavior is byte-for-byte identical
 * to the previous in-store definitions — see `plain-messages-store.test.ts`.
 */

// ─── Wire shapes from API ─────────────────────────────────────────────────────

export interface WirePlainMessage {
  id: string;
  clientId: string;
  senderUserId: string;
  senderUsername: string;
  recipientUserId?: string;
  recipientUsername?: string;
  /** Set when the wire message belongs to a plain group thread. Owned by
   *  plain-groups-store; this store ignores such messages to avoid duplicating
   *  them into the sender's DM list. */
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

export interface WireHistoryResponse {
  messages: WirePlainMessage[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface WireSendResponse {
  id: string;
  clientId: string;
  createdAt: string;
}

export interface WireInitUploadResponse {
  attachmentId: string;
  uploadUrl: string;
  uploadFields?: Record<string, string>;
  expiresAt: string;
}

export interface WireConfirmUploadResponse {
  attachmentId: string;
  downloadUrl: string;
}

// ─── Pure transforms ──────────────────────────────────────────────────────────

/** Normalize an API/WS wire message into the local `PlainMessage` shape. */
export function wireToPlainMessage(wire: WirePlainMessage, myUserId: string): PlainMessage {
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

/**
 * Insert `msg` into `conversations[conversationKey]`, deduping against an
 * existing optimistic message by `id`/`clientId`. When a match is found the
 * optimistic row is promoted to `sent` (this is the WS-echo replacement path);
 * otherwise the message is appended and unread count bumped for peer messages.
 */
export function mergeIncomingMessage(
  conversations: Record<string, PlainConversation>,
  conversationKey: string,
  msg: PlainMessage,
  username: string
): Record<string, PlainConversation> {
  const existing = conversations[conversationKey];
  if (existing) {
    const alreadyExists = existing.messages.some(
      (m) => m.id === msg.id || m.clientId === msg.clientId
    );
    if (alreadyExists) {
      // Update status of optimistic message to sent
      const messages = existing.messages.map((m) =>
        m.clientId === msg.clientId ? { ...m, id: msg.id, status: "sent" as const, uploadProgress: undefined } : m
      );
      return {
        ...conversations,
        [conversationKey]: {
          ...existing,
          messages,
          lastMessageAt: Math.max(existing.lastMessageAt, msg.timestamp),
        },
      };
    }
    return {
      ...conversations,
      [conversationKey]: {
        ...existing,
        messages: [...existing.messages, msg],
        lastMessageAt: Math.max(existing.lastMessageAt, msg.timestamp),
        unreadCount: msg.isOwn ? existing.unreadCount : existing.unreadCount + 1,
      },
    };
  }
  return {
    ...conversations,
    [conversationKey]: {
      userId: conversationKey,
      username,
      messages: [msg],
      lastMessageAt: msg.timestamp,
      unreadCount: msg.isOwn ? 0 : 1,
      hasMore: false,
      historyLoaded: false,
    },
  };
}

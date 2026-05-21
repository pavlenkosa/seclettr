import type { PlainGroup, PlainGroupMember, PlainMessage, PlainMessageType } from "../types";
export type {
  WireConfirmUploadResponse,
  WireInitUploadResponse,
  WireSendResponse,
} from "../shared/plain-wire-shared";

/**
 * Wire/projection layer for the plain groups store.
 *
 * Owns the API wire shapes and the pure transforms extracted from
 * `plain-groups-store.ts`:
 *  - `wireToPlainGroupMessage` / `wireToPlainGroup` — normalize API/WS wire
 *    payloads into local domain shapes;
 *  - `mergeGroupMessage` — dedupe + optimistic reconciliation for a group.
 *
 * All functions are pure (no `set/get`, no I/O). Behavior is byte-for-byte
 * identical to the previous in-store definitions.
 */

// ─── Wire shapes ──────────────────────────────────────────────────────────────

export interface WirePlainGroupMessage {
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
    /** Presigned download URL included in history responses. Use as localUrl. */
    downloadUrl?: string;
  };
  replyTo?: { id: string; content: string; senderName?: string };
  createdAt: string;
  editedAt?: string;
}

export interface WireGroupHistoryResponse {
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

export interface WirePlainGroup {
  id: string;
  name: string;
  creatorId: string;
  members: WireGroupMember[];
  createdAt: string;
  updatedAt: string;
}

export interface WireGroupListResponse {
  groups: WirePlainGroup[];
}

// ─── Pure transforms ──────────────────────────────────────────────────────────

/** Normalize an API/WS wire group message into the local `PlainMessage` shape. */
export function wireToPlainGroupMessage(wire: WirePlainGroupMessage, myUserId: string): PlainMessage {
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
          localUrl: wire.attachment.downloadUrl,
        }
      : undefined,
    replyTo: wire.replyTo,
    timestamp: new Date(wire.createdAt).getTime(),
    editedAt: wire.editedAt ? new Date(wire.editedAt).getTime() : undefined,
    isOwn: wire.senderUserId === myUserId,
    status: "sent",
  };
}

/** Normalize an API wire group into the local `PlainGroup` shape (no messages). */
export function wireToPlainGroup(wire: WirePlainGroup): PlainGroup {
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

/**
 * Insert `msg` into `groups[groupId]`, deduping against an existing optimistic
 * message by `id`/`clientId`. On a match the optimistic row is promoted to
 * `sent` (WS-echo replacement); otherwise the message is appended and unread
 * count bumped for peer messages. No-op when the group is unknown.
 */
export function mergeGroupMessage(
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

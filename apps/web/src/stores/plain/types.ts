export type PlainMessageType = "text" | "attachment" | "voice_note" | "video_note" | "call";

export interface PlainAttachmentMeta {
  attachmentId: string;
  contentType: string;
  fileName?: string;
  size: number;
  durationMs?: number;
  mediaGroupId?: string;
  /** Locally resolved URL (presigned download or object URL for pending uploads) */
  localUrl?: string;
}

export interface PlainCallMeta {
  mode: "audio" | "video";
  direction: "inbound" | "outbound";
  outcome: "ended" | "declined" | "missed";
  durationSec?: number;
}

export interface PlainReplyMeta {
  id: string;
  content: string;
  senderName?: string;
}

export interface PlainMessage {
  id: string;
  clientId: string;
  senderId: string;
  senderName: string;
  content: string;
  type: PlainMessageType;
  attachment?: PlainAttachmentMeta;
  call?: PlainCallMeta;
  replyTo?: PlainReplyMeta;
  timestamp: number;
  editedAt?: number;
  isOwn: boolean;
  status: "sending" | "sent" | "error";
  /** Set for uploads in progress */
  uploadProgress?: number;
}

export interface PlainConversation {
  userId: string;
  username: string;
  messages: PlainMessage[];
  lastMessageAt: number;
  unreadCount: number;
  /** Oldest createdAt cursor for fetching earlier history */
  nextCursor?: string;
  hasMore: boolean;
  historyLoaded: boolean;
}

export interface PlainGroupMember {
  userId: string;
  username: string;
  role: "owner" | "admin" | "member";
  joinedAt: string;
}

export interface PlainGroup {
  groupId: string;
  name: string;
  creatorId: string;
  members: PlainGroupMember[];
  messages: PlainMessage[];
  lastMessageAt: number;
  unreadCount: number;
  nextCursor?: string;
  hasMore: boolean;
  historyLoaded: boolean;
  createdAt: string;
  updatedAt: string;
}

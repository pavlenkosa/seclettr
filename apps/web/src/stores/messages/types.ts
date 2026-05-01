import type { PeerIdentityAlert } from "./peer-identity-runtime";
export type { PeerIdentityAlert } from "./peer-identity-runtime";

export interface AttachmentMessageMeta {
  attachmentId: string;
  key: string;
  digest: string;
  mimeType: string;
  fileName?: string;
  size: number;
  caption?: string;
  kind?: "file" | "voice_note" | "video_note";
  durationMs?: number;
  mediaGroupId?: string;
}

export interface CallMessageMeta {
  mode: "audio" | "video";
  direction: "inbound" | "outbound";
  outcome: "ended" | "declined" | "missed";
  durationSec?: number;
}

export interface MessageReplyMeta {
  id: string;
  content: string;
  senderName?: string;
}

export interface DirectMessageDeliveryMeta {
  recipientDeviceId: string;
  messageId: string;
  status: "created" | "duplicate";
}

export interface Message {
  id: string;
  senderId: string;
  senderDeviceId: string;
  content: string;
  type: "text" | "attachment" | "call";
  attachment?: AttachmentMessageMeta;
  call?: CallMessageMeta;
  replyTo?: MessageReplyMeta;
  timestamp: number;
  status: "sending" | "sent" | "delivered" | "read" | "error";
  directDeliveries?: DirectMessageDeliveryMeta[];
  errorKind?:
    | "decrypt_failed"
    | "session_missing"
    | "corrupted_payload"
    | "trust_failure";
  isOwn: boolean;
}

export interface Conversation {
  userId: string;
  username: string;
  messages: Message[];
  lastMessageAt: number;
  unreadCount: number;
  peerIdentityKey?: string;
  peerIdentityDeviceId?: string;
  peerIdentityByDevice?: Record<string, string>;
  peerIdentityAlertsByDevice?: Record<string, PeerIdentityAlert>;
}

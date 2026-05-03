import type { GroupHistoryMessage, GroupMemberRole } from "@seclettr/protocol";
import type { AttachmentMessageMeta } from "@/stores/messages";

export interface GroupSummaryDto {
  groupId: string;
  name: string;
  createdAt: string;
  cryptoEpoch?: number;
}

export interface GroupDetailsDto extends GroupSummaryDto {
  members: GroupMember[];
  memberDeviceLabels?: Record<string, string>;
}

export interface GroupHistoryMessageEnvelope extends Omit<GroupHistoryMessage, "aeadVersion" | "cryptoEpoch"> {
  aeadVersion: 0 | 1;
  cryptoEpoch: number;
}

export interface GroupMember {
  userId: string;
  username: string;
  joinedAt: string;
  role?: GroupMemberRole;
}

export interface MessageReplyMeta {
  id: string;
  content: string;
  senderName?: string;
}

export interface GroupChatMessage {
  id: string;
  senderDeviceId: string;
  senderLabel: string;
  content: string;
  type?: "text" | "attachment";
  attachment?: AttachmentMessageMeta;
  replyTo?: MessageReplyMeta;
  timestamp: number;
  status: "sending" | "sent" | "delivered" | "error";
  isOwn: boolean;
  rawType: string;
}

export interface GroupChat {
  groupId: string;
  name: string;
  createdAt: string;
  cryptoEpoch: number;
  members: GroupMember[];
  memberDeviceLabels: Record<string, string>;
  messages: GroupChatMessage[];
  lastMessageAt: number;
  unreadCount: number;
  historyLoaded: boolean;
}

import type {
  PlaintextSenderKeyDistributionMessage,
  WsServerMessage,
} from "@seclettr/protocol";
import type { Conversation, Message } from "./types";
export type { AttachmentMessageMeta, Conversation, Message } from "./types";

export interface MessagesState {
  conversations: Record<string, Conversation>;
  activeConversationId: string | null;
  pendingSessions: Set<string>;
  processedMessageIds: Set<string>;
  pendingAckMessageIds: Set<string>;
  quarantinedMessageIds: Set<string>;
  pendingReadReceiptMessageIds: Set<string>;
  presenceByUser: Record<
    string,
    { online: boolean; lastSeenAt?: string; updatedAt: number }
  >;
  typingByUser: Record<string, { typing: boolean; updatedAt: number }>;
  wsConnected: boolean;
  historyLoaded: boolean;

  setActiveConversation: (userId: string | null) => void;
  fetchUserPresence: (userId: string) => Promise<void>;
  sendTypingSignal: (targetUserId: string, isTyping: boolean) => void;
  markConversationRead: (userId: string) => Promise<void>;
  sendMessage: (
    recipientUserId: string,
    text: string,
    reply?: { id: string; snippet: string }
  ) => Promise<void>;
  sendAttachment: (
    recipientUserId: string,
    file: File,
    caption?: string,
    mediaGroupId?: string
  ) => Promise<void>;
  sendVoiceNote: (
    recipientUserId: string,
    blob: Blob,
    durationMs: number
  ) => Promise<void>;
  sendVideoNote: (
    recipientUserId: string,
    blob: Blob,
    durationMs: number
  ) => Promise<void>;
  acceptPeerIdentityChange: (
    recipientUserId: string,
    deviceId: string
  ) => Promise<void>;
  recordCallEvent: (params: {
    userId: string;
    username?: string;
    mode: "audio" | "video";
    direction: "inbound" | "outbound";
    outcome: "ended" | "declined" | "missed";
    durationSec?: number;
  }) => void;
  ensureConversationUsername: (
    userId: string,
    preferredUsername?: string
  ) => Promise<string | null>;
  sendSenderKeyDistribution: (
    recipientUserId: string,
    payload: PlaintextSenderKeyDistributionMessage,
    options?: {
      prefetchedDevices?: Array<{
        deviceId: string;
        identityKeyPublic: string;
      }>;
    }
  ) => Promise<string[]>;
  upsertConversation: (conversation: Conversation) => void;
  ensureConversation: (userId: string, username: string) => void;
  loadHistory: () => Promise<void>;
  handleIncomingMessage: (
    msg: WsServerMessage & { type: "message.new" }
  ) => Promise<void>;
  startListening: () => () => void;
  reset: () => void;
}

export type SetMessagesState = (
  partial:
    | Partial<MessagesState>
    | ((state: MessagesState) => Partial<MessagesState>)
) => void;

export type GetMessagesState = () => MessagesState;

export type IncomingDecryptErrorKind = Message["errorKind"];

export interface MessagesSendEncryptedAttachmentParams {
  recipientUserId: string;
  blob: Blob;
  mimeType: string;
  fileName: string;
  kind: "file" | "voice_note" | "video_note";
  durationMs?: number;
  caption?: string;
  optimisticContent: string;
  fallbackUploadFileName: string;
  mediaGroupId?: string;
}


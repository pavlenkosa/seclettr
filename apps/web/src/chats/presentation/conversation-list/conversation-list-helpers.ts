import type { CallMessageMeta, Conversation } from "@/stores/messages";
import type { GroupChat } from "@/stores/groups";
import type { PlainConversation, PlainGroup, PlainPinKind } from "@/stores/plain";
import type { SavedMessage } from "@/stores/saved";

export type PreviewStatus = "sending" | "sent" | "delivered" | "read" | "error";

export interface EntryLastMessage {
  type: "text" | "attachment" | "call";
  content: string;
  attachment?: {
    kind?: "file" | "voice_note" | "video_note";
    mimeType: string;
    fileName?: string;
  };
  call?: CallMessageMeta;
  isOwn: boolean;
  status: PreviewStatus;
  senderLabel?: string;
}

export interface ConversationEntry {
  key: string;
  id: string;
  kind: "direct" | "group" | "plain-direct" | "plain-group" | "saved";
  name: string;
  lastMessageAt: number;
  unreadCount: number;
  lastMessage?: EntryLastMessage;
  isEncrypted: boolean;
  pinnedAt?: number;
  pinKind?: PlainPinKind;
  /** Non-null when the chat belongs to a folder. Populated for plain chats only. */
  folderId?: string;
}

export interface ConversationSelection {
  kind: ConversationEntry["kind"];
  id: string;
}

type DirectConversationMessage = Conversation["messages"][number];
type GroupConversationMessage = GroupChat["messages"][number];
type ConversationTranslateFn = (key: string, params?: Record<string, string | number>) => string;
type PlainPinsMap = Record<string, { pinnedAt: number } | undefined>;

const MIN_LOADING_PLACEHOLDERS = 3;
const DEFAULT_LOADING_PLACEHOLDERS = 5;
const MAX_LOADING_PLACEHOLDERS = 8;

export function formatTime(
  ms: number,
  locale: string,
  t: ConversationTranslateFn,
  nowMs = Date.now()
): string {
  if (!ms) return "";
  const diff = nowMs - ms;
  if (diff < 60_000) return t("conversation.now");
  if (diff < 3_600_000) return t("conversation.minutesShort", { count: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) {
    return new Date(ms).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  }
  return new Date(ms).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export function getPreviewText(
  last: EntryLastMessage | undefined,
  t: ConversationTranslateFn
): string {
  if (!last) return "";

  if (last.type === "call" && last.call) {
    return getCallPreviewText(last.call, t);
  }

  if (last.type === "attachment") {
    return getAttachmentPreviewText(last, t);
  }

  if (last.content === "[encrypted message]" || last.content === "[encrypted group message]") {
    return t("conversation.encryptedMessagePreview");
  }

  return last.content;
}

export function clampLoadingPlaceholderCount(count: number | undefined): number {
  if (!count || !Number.isFinite(count)) {
    return DEFAULT_LOADING_PLACEHOLDERS;
  }
  return Math.min(
    MAX_LOADING_PLACEHOLDERS,
    Math.max(MIN_LOADING_PLACEHOLDERS, Math.round(count))
  );
}

export function buildSavedEntry(
  savedMessages: SavedMessage[],
  savedTitle: string
): ConversationEntry {
  const last = savedMessages.at(-1);
  return {
    key: "saved:saved",
    id: "saved",
    kind: "saved",
    name: savedTitle,
    lastMessageAt: last?.timestamp ?? 0,
    unreadCount: 0,
    lastMessage: last
      ? { type: "text", content: last.content, isOwn: true, status: "sent" }
      : undefined,
    isEncrypted: false,
  };
}

type ChatFolderMap = Record<string, string>;

export function buildConversationEntries({
  conversations,
  groups,
  pins,
  plainConversations,
  plainGroups,
  chatFolderMap = {},
}: {
  conversations: Conversation[];
  groups: GroupChat[];
  pins: PlainPinsMap;
  plainConversations: PlainConversation[];
  plainGroups: PlainGroup[];
  chatFolderMap?: ChatFolderMap;
}): ConversationEntry[] {
  const directEntries = conversations.map(mapDirectConversation);
  const groupEntries = groups.map(mapGroupConversation);
  const plainDirectEntries = plainConversations.map((conversation) =>
    mapPlainConversation(
      conversation,
      pins[`dm:${conversation.userId}`]?.pinnedAt,
      chatFolderMap[`dm:${conversation.userId}`]
    )
  );
  const plainGroupEntries = plainGroups.map((group) =>
    mapPlainGroup(
      group,
      pins[`group:${group.groupId}`]?.pinnedAt,
      chatFolderMap[`group:${group.groupId}`]
    )
  );

  return [...directEntries, ...groupEntries, ...plainDirectEntries, ...plainGroupEntries]
    .sort((left, right) => {
      const leftPin = left.pinnedAt ?? 0;
      const rightPin = right.pinnedAt ?? 0;
      if (leftPin !== rightPin) return rightPin - leftPin;
      return right.lastMessageAt - left.lastMessageAt;
    });
}

function getCallPreviewText(call: NonNullable<EntryLastMessage["call"]>, t: ConversationTranslateFn): string {
  const directionLabel = call.direction === "outbound"
    ? t("call.log.outbound")
    : t("call.log.inbound");
  const modeLabel = call.mode === "video"
    ? t("call.videoCall")
    : t("call.voiceCall");
  const outcomeLabel = t(`call.log.${call.outcome}`);
  return `${directionLabel} ${modeLabel}: ${outcomeLabel}`;
}

function getAttachmentPreviewText(last: EntryLastMessage, t: ConversationTranslateFn): string {
  const { attachment, content } = last;

  if (attachment?.kind === "voice_note" || attachment?.mimeType.startsWith("audio/")) {
    return t("conversation.voiceNotePreview");
  }

  if (attachment?.kind === "video_note") {
    return t("conversation.videoNotePreview");
  }

  if (attachment?.mimeType === "image/gif") {
    return t("conversation.gifPreview");
  }

  if (attachment?.mimeType.startsWith("image/")) {
    return t("conversation.photoPreview");
  }

  if (attachment?.mimeType.startsWith("video/")) {
    return t("conversation.videoPreview");
  }

  if (content === "[attachment]" || content === "") {
    return attachment?.fileName ?? t("conversation.attachmentPreview");
  }

  return content === "[invalid attachment]"
    ? t("conversation.invalidAttachmentPreview")
    : content;
}

function mapDirectLastMessage(last: DirectConversationMessage | undefined): EntryLastMessage | undefined {
  if (!last) {
    return undefined;
  }

  return {
    type: last.type,
    content: last.content,
    attachment: last.attachment
      ? {
        kind: last.attachment.kind,
        mimeType: last.attachment.mimeType,
        fileName: last.attachment.fileName,
      }
      : undefined,
    call: last.call,
    isOwn: last.isOwn,
    status: last.status,
  };
}

function mapGroupLastMessage(last: GroupConversationMessage | undefined): EntryLastMessage | undefined {
  if (!last) {
    return undefined;
  }

  return {
    type: "text",
    content: last.content,
    isOwn: last.isOwn,
    status: last.status,
    senderLabel: last.senderLabel,
  };
}

function mapDirectConversation(conversation: Conversation): ConversationEntry {
  return {
    key: `direct:${conversation.userId}`,
    id: conversation.userId,
    kind: "direct",
    name: conversation.username,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount: conversation.unreadCount,
    lastMessage: mapDirectLastMessage(conversation.messages.at(-1)),
    isEncrypted: true,
  };
}

function mapGroupConversation(group: GroupChat): ConversationEntry {
  return {
    key: `group:${group.groupId}`,
    id: group.groupId,
    kind: "group",
    name: group.name,
    lastMessageAt: group.lastMessageAt,
    unreadCount: group.unreadCount,
    lastMessage: mapGroupLastMessage(group.messages.at(-1)),
    isEncrypted: true,
  };
}

function mapPlainLastMessage(last: PlainConversation["messages"][number] | undefined): EntryLastMessage | undefined {
  if (!last) return undefined;
  if (last.type === "call" && last.call) {
    return {
      type: "call",
      content: "",
      call: {
        mode: last.call.mode,
        direction: last.call.direction,
        outcome: last.call.outcome,
        durationSec: last.call.durationSec,
      },
      isOwn: last.isOwn,
      status: last.status,
    };
  }
  return {
    type: last.type === "text" ? "text" : "attachment",
    content: last.content,
    attachment: last.attachment
      ? {
        kind: (["voice_note", "video_note"].includes(last.type) ? last.type : "file") as "file" | "voice_note" | "video_note",
        mimeType: last.attachment.contentType,
        fileName: last.attachment.fileName,
      }
      : undefined,
    isOwn: last.isOwn,
    status: last.status,
  };
}

function mapPlainConversation(
  conversation: PlainConversation,
  pinnedAt: number | undefined,
  folderId: string | undefined
): ConversationEntry {
  return {
    key: `plain-direct:${conversation.userId}`,
    id: conversation.userId,
    kind: "plain-direct",
    name: conversation.username,
    lastMessageAt: conversation.lastMessageAt,
    unreadCount: conversation.unreadCount,
    lastMessage: mapPlainLastMessage(conversation.messages.at(-1)),
    isEncrypted: false,
    pinnedAt,
    pinKind: "dm",
    folderId,
  };
}

function mapPlainGroupLastMessage(last: PlainGroup["messages"][number] | undefined): EntryLastMessage | undefined {
  if (!last) return undefined;
  if (last.type === "call" && last.call) {
    return {
      type: "call",
      content: "",
      call: {
        mode: last.call.mode,
        direction: last.call.direction,
        outcome: last.call.outcome,
        durationSec: last.call.durationSec,
      },
      isOwn: last.isOwn,
      status: last.status,
      senderLabel: last.isOwn ? undefined : last.senderName,
    };
  }
  return {
    type: last.type === "text" ? "text" : "attachment",
    content: last.content,
    attachment: last.attachment
      ? {
        kind: (["voice_note", "video_note"].includes(last.type) ? last.type : "file") as "file" | "voice_note" | "video_note",
        mimeType: last.attachment.contentType,
        fileName: last.attachment.fileName,
      }
      : undefined,
    isOwn: last.isOwn,
    status: last.status,
    senderLabel: last.isOwn ? undefined : last.senderName,
  };
}

function mapPlainGroup(
  group: PlainGroup,
  pinnedAt: number | undefined,
  folderId: string | undefined
): ConversationEntry {
  return {
    key: `plain-group:${group.groupId}`,
    id: group.groupId,
    kind: "plain-group",
    name: group.name,
    lastMessageAt: group.lastMessageAt,
    unreadCount: group.unreadCount,
    lastMessage: mapPlainGroupLastMessage(group.messages.at(-1)),
    isEncrypted: false,
    pinnedAt,
    pinKind: "group",
    folderId,
  };
}

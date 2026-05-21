import { useMemo, useRef } from "react";
import type { Message } from "@/stores/messages";
import type { GroupChatMessage } from "@/stores/groups";
import type {
  PlainConversation,
  PlainGroup,
  PlainMessage,
} from "@/stores/plain";
import type { SavedMessage, SavedMessageAttachment } from "@/stores/saved";
import type { Conversation } from "@/stores/messages";
import type { GroupChat } from "@/stores/groups";

interface UseChatWorkspaceProjectionOptions {
  activeConversation: Conversation | null;
  activeGroup: GroupChat | null;
  activePlainConversation: PlainConversation | null;
  activePlainGroup: PlainGroup | null;
  conversations: Record<string, Conversation>;
  groups: Record<string, GroupChat>;
  plainConversations: Record<string, PlainConversation>;
  plainGroups: Record<string, PlainGroup>;
  savedThreadActive: boolean;
  savedMessages: SavedMessage[];
  userId: string | null;
}

interface GroupMessageProjectionCache {
  sourceMessages: readonly GroupChatMessage[];
  activeMessages: Message[];
  senderLabels: Record<string, string>;
}

function toChatMessage(message: GroupChatMessage): Message {
  return {
    id: message.id,
    senderId: message.senderDeviceId,
    senderDeviceId: message.senderDeviceId,
    content: message.content,
    type: message.type ?? "text",
    attachment: message.attachment,
    timestamp: message.timestamp,
    status: message.status,
    isOwn: message.isOwn,
    replyTo: message.replyTo,
  };
}

function buildGroupMessageProjection(
  sourceMessages: readonly GroupChatMessage[],
  previous: GroupMessageProjectionCache | null
): GroupMessageProjectionCache {
  if (previous?.sourceMessages === sourceMessages) {
    return previous;
  }

  const sharedLength = Math.min(previous?.sourceMessages.length ?? 0, sourceMessages.length);
  let firstChangedIndex = 0;
  while (
    previous
    && firstChangedIndex < sharedLength
    && previous.sourceMessages[firstChangedIndex] === sourceMessages[firstChangedIndex]
  ) {
    firstChangedIndex += 1;
  }

  const activeMessages = previous
    ? previous.activeMessages.slice(0, firstChangedIndex)
    : [];
  for (let index = firstChangedIndex; index < sourceMessages.length; index += 1) {
    activeMessages.push(toChatMessage(sourceMessages[index]!));
  }

  const senderLabels: Record<string, string> = {};
  for (const message of sourceMessages) {
    if (!message.isOwn) {
      senderLabels[message.id] = message.senderLabel;
    }
  }

  return {
    sourceMessages,
    activeMessages,
    senderLabels,
  };
}

/**
 * Owns active thread projection, list identities, saved-thread shaping,
 * and group/plain sender-label formatting without mixing route or side effects.
 */
export function useChatWorkspaceProjection(
  options: UseChatWorkspaceProjectionOptions
) {
  const {
    activeConversation,
    activeGroup,
    activePlainConversation,
    activePlainGroup,
    conversations,
    groups,
    plainConversations,
    plainGroups,
    savedThreadActive,
    savedMessages,
    userId,
  } = options;

  const groupMessageProjectionCacheRef = useRef<GroupMessageProjectionCache | null>(null);

  const activeGroupListId = activeGroup ? `group:${activeGroup.groupId}` : null;
  const activePlainGroupListId = activePlainGroup ? `plain-group:${activePlainGroup.groupId}` : null;
  const activeListId =
    activeConversation
      ? `direct:${activeConversation.userId}`
      : activeGroupListId
        ?? (activePlainConversation ? `plain-direct:${activePlainConversation.userId}` : null)
        ?? activePlainGroupListId
        ?? (savedThreadActive ? "saved:saved" : null);

  const conversationEntries = useMemo(
    () => Object.values(conversations),
    [conversations]
  );
  const groupEntries = useMemo(() => Object.values(groups), [groups]);
  const plainConversationEntries = useMemo(
    () => Object.values(plainConversations),
    [plainConversations]
  );
  const plainGroupEntries = useMemo(() => Object.values(plainGroups), [plainGroups]);

  const activeGroupProjection = useMemo(() => {
    if (!activeGroup) return null;
    const nextProjection = buildGroupMessageProjection(
      activeGroup.messages,
      groupMessageProjectionCacheRef.current
    );
    groupMessageProjectionCacheRef.current = nextProjection;
    return nextProjection;
  }, [activeGroup]);

  const plainActiveMessages = useMemo<PlainMessage[]>(() => {
    if (activePlainConversation) return activePlainConversation.messages;
    if (activePlainGroup) return activePlainGroup.messages;
    return [];
  }, [activePlainConversation, activePlainGroup]);

  const savedActiveMessages = useMemo<Message[]>(
    () =>
      savedMessages.map((message: SavedMessage) => {
        const attachment: SavedMessageAttachment | undefined = message.attachment;
        return {
          id: message.id,
          senderId: userId ?? "me",
          senderDeviceId: userId ?? "me",
          content: message.content,
          type: attachment ? ("attachment" as const) : ("text" as const),
          timestamp: message.timestamp,
          status: "sent" as const,
          isOwn: true,
          attachment: attachment
            ? {
                attachmentId: message.id,
                key: "",
                digest: "",
                mimeType: attachment.mimeType,
                fileName: attachment.fileName,
                size: attachment.size,
                kind: attachment.kind,
                durationMs: attachment.durationMs,
                mediaGroupId: attachment.mediaGroupId,
                isPlain: true,
                localUrl: attachment.dataUrl,
              }
            : undefined,
        };
      }),
    [savedMessages, userId]
  );

  const activeMessages = useMemo<Message[]>(() => {
    if (activeConversation) return activeConversation.messages;
    if (activeGroupProjection) return activeGroupProjection.activeMessages;
    if (savedThreadActive) return savedActiveMessages;
    return plainActiveMessages.map((message) => ({
      id: message.id,
      senderId: message.senderId,
      senderDeviceId: message.senderId,
      content: message.content,
      type: message.type === "text"
        ? "text" as const
        : message.type === "call"
          ? "call" as const
          : "attachment" as const,
      call: message.call,
      attachment: message.attachment
        ? {
            attachmentId: message.attachment.attachmentId,
            key: "",
            digest: "",
            mimeType: message.attachment.contentType,
            fileName: message.attachment.fileName,
            size: message.attachment.size,
            kind: (["voice_note", "video_note"].includes(message.type) ? message.type : "file") as "file" | "voice_note" | "video_note",
            durationMs: message.attachment.durationMs,
            mediaGroupId: message.attachment.mediaGroupId,
            isPlain: true,
            localUrl: message.attachment.localUrl,
            uploadProgress: message.uploadProgress,
            caption: message.content?.trim() || undefined,
          }
        : undefined,
      timestamp: message.timestamp,
      status: message.status,
      isOwn: message.isOwn,
      replyTo: message.replyTo,
    }));
  }, [activeConversation, activeGroupProjection, savedThreadActive, savedActiveMessages, plainActiveMessages]);

  const plainGroupSenderLabels = useMemo<Record<string, string>>(() => {
    if (!activePlainGroup) return {};
    const labels: Record<string, string> = {};
    for (const message of activePlainGroup.messages) {
      if (!message.isOwn) {
        const name = message.senderName?.trim();
        labels[message.id] = name ? `@${name}` : "";
      }
    }
    return labels;
  }, [activePlainGroup]);

  const groupSenderLabels =
    activeGroupProjection?.senderLabels ?? (activePlainGroup ? plainGroupSenderLabels : undefined);

  const activeHistoryLoading: boolean = (
    (activePlainConversation && activePlainConversation.historyLoaded === false) ||
    (activePlainGroup && activePlainGroup.historyLoaded === false) ||
    false
  );

  return {
    activeHistoryLoading,
    activeListId,
    activeMessages,
    conversationEntries,
    groupEntries,
    groupSenderLabels,
    plainConversationEntries,
    plainGroupEntries,
  };
}

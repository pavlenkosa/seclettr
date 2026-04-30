import { useCallback } from "react";
import { useMessagesStore, type MessageReplyMeta } from "@/stores/messages";
import { useGroupsStore } from "@/stores/groups";

interface UseChatComposerMessageActionsOptions {
  recipientUserId?: string;
  groupId?: string;
}

export function useChatComposerMessageActions({
  recipientUserId,
  groupId,
}: UseChatComposerMessageActionsOptions) {
  const isGroupComposer = typeof groupId === "string" && groupId.length > 0;
  const sendMessage = useMessagesStore((state) => state.sendMessage);
  const sendAttachment = useMessagesStore((state) => state.sendAttachment);
  const sendGroupText = useGroupsStore((state) => state.sendGroupText);
  const sendGroupFileAttachment = useGroupsStore((state) => state.sendGroupFileAttachment);

  const sendTextMessage = useCallback(
    async (text: string, replyTo?: MessageReplyMeta) => {
      const outgoingReply = replyTo
        ? { id: replyTo.id, snippet: replyTo.content }
        : undefined;

      if (isGroupComposer && groupId) {
        await sendGroupText(groupId, text, outgoingReply);
        return;
      }

      if (!recipientUserId) return;
      await sendMessage(recipientUserId, text, outgoingReply);
    },
    [groupId, isGroupComposer, recipientUserId, sendGroupText, sendMessage]
  );

  const sendFileAttachment = useCallback(
    async (file: File, mediaGroupId?: string, caption?: string) => {
      if (file.size <= 0) return;
      if (isGroupComposer && groupId) {
        await sendGroupFileAttachment(groupId, file, mediaGroupId, caption);
        return;
      }
      if (!recipientUserId) return;
      await sendAttachment(recipientUserId, file, caption, mediaGroupId);
    },
    [groupId, isGroupComposer, recipientUserId, sendAttachment, sendGroupFileAttachment]
  );

  return {
    isGroupComposer,
    sendFileAttachment,
    sendTextMessage,
  };
}

import { useCallback } from "react";
import { useMessagesStore } from "@/stores/messages";
import { useGroupsStore } from "@/stores/groups";

interface UseChatComposerMediaActionsOptions {
  recipientUserId?: string;
  groupId?: string;
}

export function useChatComposerMediaActions({
  recipientUserId,
  groupId,
}: UseChatComposerMediaActionsOptions) {
  const isGroupComposer = typeof groupId === "string" && groupId.length > 0;
  const sendVoiceNote = useMessagesStore((state) => state.sendVoiceNote);
  const sendVideoNote = useMessagesStore((state) => state.sendVideoNote);
  const sendGroupVoiceNote = useGroupsStore((state) => state.sendGroupVoiceNote);
  const sendGroupVideoNote = useGroupsStore((state) => state.sendGroupVideoNote);

  const sendVoiceBlob = useCallback(
    async (voiceBlob: Blob, durationMs: number) => {
      if (voiceBlob.size <= 0) return;
      if (isGroupComposer && groupId) {
        await sendGroupVoiceNote(groupId, voiceBlob, durationMs);
        return;
      }
      if (!recipientUserId) return;
      await sendVoiceNote(recipientUserId, voiceBlob, durationMs);
    },
    [groupId, isGroupComposer, recipientUserId, sendGroupVoiceNote, sendVoiceNote]
  );

  const sendVideoBlob = useCallback(
    async (videoBlob: Blob, durationMs: number) => {
      if (videoBlob.size <= 0) return;
      if (isGroupComposer && groupId) {
        await sendGroupVideoNote(groupId, videoBlob, durationMs);
        return;
      }
      if (!recipientUserId) return;
      await sendVideoNote(recipientUserId, videoBlob, durationMs);
    },
    [groupId, isGroupComposer, recipientUserId, sendGroupVideoNote, sendVideoNote]
  );

  return {
    isGroupComposer,
    sendVideoBlob,
    sendVoiceBlob,
  };
}

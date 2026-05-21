import type { MessageReplyMeta } from "@/stores/messages";
import type { WorkspaceEntryState } from "./chat-page-types";

export interface ChatThreadComposerBindings {
  composerKey: string;
  recipientUserId?: string;
  groupId?: string;
  onSendText?: (text: string, replyTo?: MessageReplyMeta) => Promise<void>;
  onSendFile?: (file: File, mediaGroupId?: string, caption?: string) => Promise<void>;
  onSendVoiceBlob?: (blob: Blob, durationMs: number) => Promise<void>;
  onSendVideoBlob?: (blob: Blob, durationMs: number) => Promise<void>;
  isGroupComposer?: boolean;
  placeholder?: string;
  supportsGif?: boolean;
}

interface BuildChatThreadComposerBindingsOptions {
  activeThreadKind: WorkspaceEntryState["activeThreadKind"];
  activeConversation: WorkspaceEntryState["activeConversation"];
  activeGroup: WorkspaceEntryState["activeGroup"];
  activePlainConversation: WorkspaceEntryState["activePlainConversation"];
  activePlainGroup: WorkspaceEntryState["activePlainGroup"];
  activeListId: WorkspaceEntryState["activeListId"];
  sendPlainText: WorkspaceEntryState["sendPlainText"];
  sendPlainAttachment: WorkspaceEntryState["sendPlainAttachment"];
  sendPlainGroupText: WorkspaceEntryState["sendPlainGroupText"];
  sendPlainGroupAttachment: WorkspaceEntryState["sendPlainGroupAttachment"];
  sendSavedMessage: WorkspaceEntryState["sendSavedMessage"];
  sendSavedFile: WorkspaceEntryState["sendSavedFile"];
  savedPlaceholder: string;
}

function createComposerMediaNoteFile(blob: Blob, kind: "voice" | "video"): File {
  return new File(
    [blob],
    kind === "voice" ? "voice.ogg" : "video.mp4",
    { type: blob.type }
  );
}

/**
 * Owns thread-kind specific `MessageComposer` send profiles for chat threads.
 *
 * Owns:
 *   - mapping active thread kind to `MessageComposer` runtime props
 *   - plain-thread adapter callbacks
 *   - saved-messages adapter callbacks
 *   - media-note `Blob -> File` normalization for non-default composer runtimes
 *
 * Does not own:
 *   - trust/security gating
 *   - composer UI state
 *   - encrypted/plain send runtime implementation
 */
export function buildChatThreadComposerBindings({
  activeThreadKind,
  activeConversation,
  activeGroup,
  activePlainConversation,
  activePlainGroup,
  activeListId,
  sendPlainText,
  sendPlainAttachment,
  sendPlainGroupText,
  sendPlainGroupAttachment,
  sendSavedMessage,
  sendSavedFile,
  savedPlaceholder,
}: BuildChatThreadComposerBindingsOptions): ChatThreadComposerBindings | null {
  if (activeThreadKind === "direct" && activeConversation) {
    return {
      composerKey: activeListId ?? "direct:unknown",
      recipientUserId: activeConversation.userId,
    };
  }

  if (activeThreadKind === "group" && activeGroup) {
    return {
      composerKey: activeListId ?? "group:unknown",
      groupId: activeGroup.groupId,
    };
  }

  if (activeThreadKind === "plain-direct" && activePlainConversation) {
    return {
      composerKey: activeListId ?? "plain-direct:unknown",
      recipientUserId: activePlainConversation.userId,
      onSendText: async (content, replyTo) => {
        await sendPlainText(
          activePlainConversation.userId,
          activePlainConversation.username,
          content,
          replyTo
        );
      },
      onSendFile: async (file, mediaGroupId, caption) => {
        await sendPlainAttachment(
          activePlainConversation.userId,
          activePlainConversation.username,
          file,
          {
            kind: "file",
            mediaGroupId,
            caption,
          }
        );
      },
      onSendVoiceBlob: async (blob, durationMs) => {
        await sendPlainAttachment(
          activePlainConversation.userId,
          activePlainConversation.username,
          createComposerMediaNoteFile(blob, "voice"),
          { kind: "voice_note", durationMs }
        );
      },
      onSendVideoBlob: async (blob, durationMs) => {
        await sendPlainAttachment(
          activePlainConversation.userId,
          activePlainConversation.username,
          createComposerMediaNoteFile(blob, "video"),
          { kind: "video_note", durationMs }
        );
      },
      supportsGif: true,
    };
  }

  if (activeThreadKind === "plain-group" && activePlainGroup) {
    return {
      composerKey: activeListId ?? "plain-group:unknown",
      groupId: activePlainGroup.groupId,
      onSendText: async (content, replyTo) => {
        await sendPlainGroupText(activePlainGroup.groupId, content, replyTo);
      },
      onSendFile: async (file, mediaGroupId, caption) => {
        await sendPlainGroupAttachment(activePlainGroup.groupId, file, {
          kind: "file",
          mediaGroupId,
          caption,
        });
      },
      onSendVoiceBlob: async (blob, durationMs) => {
        await sendPlainGroupAttachment(
          activePlainGroup.groupId,
          createComposerMediaNoteFile(blob, "voice"),
          { kind: "voice_note", durationMs }
        );
      },
      onSendVideoBlob: async (blob, durationMs) => {
        await sendPlainGroupAttachment(
          activePlainGroup.groupId,
          createComposerMediaNoteFile(blob, "video"),
          { kind: "video_note", durationMs }
        );
      },
      isGroupComposer: true,
      supportsGif: true,
    };
  }

  if (activeThreadKind === "saved") {
    return {
      composerKey: "saved:saved",
      onSendText: async (text) => {
        sendSavedMessage(text);
      },
      onSendFile: async (file, mediaGroupId, caption) => {
        await sendSavedFile(file, { kind: "file", caption, mediaGroupId });
      },
      onSendVoiceBlob: async (blob, durationMs) => {
        await sendSavedFile(createComposerMediaNoteFile(blob, "voice"), {
          kind: "voice_note",
          durationMs,
        });
      },
      onSendVideoBlob: async (blob, durationMs) => {
        await sendSavedFile(createComposerMediaNoteFile(blob, "video"), {
          kind: "video_note",
          durationMs,
        });
      },
      placeholder: savedPlaceholder,
    };
  }

  return null;
}

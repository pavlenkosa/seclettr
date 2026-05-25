import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import type { MessageReplyMeta } from "@/stores/messages";
import {
  resolveChatComposerActionErrorKey,
  type ChatComposerActionErrorKey,
} from "../runtime/chat-composer-action-errors";
import { useChatComposerMediaActions } from "../runtime/useChatComposerMediaActions";
import { useChatComposerMessageActions } from "../runtime/useChatComposerMessageActions";
import { useChatComposerTypingSignal } from "../runtime/useChatComposerTypingSignal";
import type { RecordMode } from "./MessageComposerPrimaryActions";
import { useMessageComposerTextInput } from "./useMessageComposerTextInput";
import { logger } from "@/lib/logger.js";

export type ComposerErrorKey =
  | ChatComposerActionErrorKey
  | "recordingFailed"
  | "microphoneUnavailable"
  | "cameraUnavailable";

interface UseMessageComposerDraftOptions {
  recipientUserId?: string;
  groupId?: string;
  onFocusChange?: (focused: boolean) => void;
  replyTo?: MessageReplyMeta;
  onClearReply?: () => void;
  onSendText?: (text: string, replyTo?: MessageReplyMeta) => Promise<void>;
  onSendFile?: (file: File, mediaGroupId?: string, caption?: string) => Promise<void>;
  onSendVoiceBlob?: (blob: Blob, durationMs: number) => Promise<void>;
  onSendVideoBlob?: (blob: Blob, durationMs: number) => Promise<void>;
}

export interface UseMessageComposerDraftResult {
  isGroupComposer: boolean;
  text: string;
  trimmedText: string;
  sending: boolean;
  composerErrorKey: ComposerErrorKey | null;
  isTextFocused: boolean;
  textareaRef: RefObject<HTMLTextAreaElement>;
  attachmentInputRef: RefObject<HTMLInputElement>;
  textSelectionRef: MutableRefObject<{ start: number; end: number }>;
  setComposerErrorKey: Dispatch<SetStateAction<ComposerErrorKey | null>>;
  clearComposerError: () => void;
  refocusTextarea: () => void;
  syncTextareaSelection: () => void;
  insertTextAtSelection: (value: string) => void;
  handleInput: (event: FormEvent<HTMLTextAreaElement>) => void;
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handleTextFocus: () => void;
  handleTextBlur: () => void;
  handleDroppedFiles: (files: File[], caption?: string) => Promise<void>;
  handleAttachmentSelected: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleSend: () => Promise<void>;
  sendVoiceBlob: (voiceBlob: Blob, durationMs: number) => Promise<void>;
  sendVideoBlob: (videoBlob: Blob, durationMs: number) => Promise<void>;
  handleRecordingError: (error: unknown, kind: RecordMode) => void;
}

function resolveComposerErrorKey(
  error: unknown,
  fallback: ComposerErrorKey
): ComposerErrorKey {
  return resolveChatComposerActionErrorKey(
    error,
    fallback as ChatComposerActionErrorKey
  );
}

export function useMessageComposerDraft({
  recipientUserId,
  groupId,
  onFocusChange,
  replyTo,
  onClearReply,
  onSendText: onSendTextOverride,
  onSendFile: onSendFileOverride,
  onSendVoiceBlob: onSendVoiceBlobOverride,
  onSendVideoBlob: onSendVideoBlobOverride,
}: UseMessageComposerDraftOptions): UseMessageComposerDraftResult {
  const isGroupComposer = typeof groupId === "string" && groupId.length > 0;
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [composerErrorKey, setComposerErrorKey] = useState<ComposerErrorKey | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const trimmedText = text.trim();

  const { handleTypingState, stopTyping, cleanupTypingSignal } = useChatComposerTypingSignal({
    recipientUserId: onSendTextOverride ? undefined : recipientUserId,
    groupId,
    chatKind: onSendTextOverride ? undefined : "e2ee",
  });
  const { sendTextMessage: sendTextMessageStore, sendFileAttachment: sendFileAttachmentStore } =
    useChatComposerMessageActions({
      recipientUserId: onSendTextOverride ? undefined : recipientUserId,
      groupId: onSendTextOverride ? undefined : groupId,
    });
  const { sendVoiceBlob: sendVoiceBlobStore, sendVideoBlob: sendVideoBlobStore } =
    useChatComposerMediaActions({
      recipientUserId: onSendVoiceBlobOverride ? undefined : recipientUserId,
      groupId: onSendVoiceBlobOverride ? undefined : groupId,
    });

  const sendTextMessage = useCallback(
    async (t: string, replyTo?: MessageReplyMeta) => {
      if (onSendTextOverride) {
        await onSendTextOverride(t, replyTo);
      } else {
        await sendTextMessageStore(t, replyTo);
      }
    },
    [onSendTextOverride, sendTextMessageStore]
  );

  const sendFileAttachmentAction = useCallback(
    async (file: File, mediaGroupId?: string, caption?: string) => {
      if (onSendFileOverride) {
        await onSendFileOverride(file, mediaGroupId, caption);
      } else {
        await sendFileAttachmentStore(file, mediaGroupId, caption);
      }
    },
    [onSendFileOverride, sendFileAttachmentStore]
  );

  const sendVoiceBlobAction = useCallback(
    async (blob: Blob, durationMs: number) => {
      if (onSendVoiceBlobOverride) {
        await onSendVoiceBlobOverride(blob, durationMs);
      } else {
        await sendVoiceBlobStore(blob, durationMs);
      }
    },
    [onSendVoiceBlobOverride, sendVoiceBlobStore]
  );

  const sendVideoBlobAction = useCallback(
    async (blob: Blob, durationMs: number) => {
      if (onSendVideoBlobOverride) {
        await onSendVideoBlobOverride(blob, durationMs);
      } else {
        await sendVideoBlobStore(blob, durationMs);
      }
    },
    [onSendVideoBlobOverride, sendVideoBlobStore]
  );

  const clearComposerError = useCallback(() => {
    setComposerErrorKey(null);
  }, []);

  const {
    handleInput,
    handleTextBlur,
    handleTextFocus,
    insertTextAtSelection,
    isTextFocused,
    refocusTextarea,
    resetTextAreaHeight,
    resizeTextAreaToContent,
    syncTextareaSelection,
    textareaRef,
    textSelectionRef,
  } = useMessageComposerTextInput({
    clearComposerError,
    handleTypingState,
    onFocusChange,
    sending,
    setText,
    stopTyping,
    text,
  });

  const restoreTextAfterFailedSend = useCallback((failedText: string) => {
    setText((current) => {
      if (!current.trim()) return failedText;
      return `${failedText}\n${current}`;
    });
    setTimeout(() => {
      resizeTextAreaToContent();
      refocusTextarea();
    }, 0);
  }, [refocusTextarea, resizeTextAreaToContent]);

  const sendVoiceBlob = useCallback(async (voiceBlob: Blob, durationMs: number) => {
    setSending(true);
    clearComposerError();
    try {
      await sendVoiceBlobAction(voiceBlob, durationMs);
    } catch (error) {
      logger.error("Voice note send failed:", error);
      setComposerErrorKey(resolveComposerErrorKey(error, "voiceSendFailed"));
    } finally {
      setSending(false);
      refocusTextarea();
    }
  }, [clearComposerError, refocusTextarea, sendVoiceBlobAction]);

  const sendVideoBlob = useCallback(async (videoBlob: Blob, durationMs: number) => {
    setSending(true);
    clearComposerError();
    try {
      await sendVideoBlobAction(videoBlob, durationMs);
    } catch (error) {
      logger.error("Video note send failed:", error);
      setComposerErrorKey(resolveComposerErrorKey(error, "videoSendFailed"));
    } finally {
      setSending(false);
      refocusTextarea();
    }
  }, [clearComposerError, refocusTextarea, sendVideoBlobAction]);

  const handleRecordingError = useCallback((error: unknown, kind: RecordMode) => {
    if (error instanceof Error) {
      if (error.message === "EMPTY_BLOB" || error.message === "RECORDER_ERROR") {
        setComposerErrorKey("recordingFailed");
        return;
      }
    }

    setComposerErrorKey(kind === "voice" ? "microphoneUnavailable" : "cameraUnavailable");
  }, []);

  const handleSend = useCallback(async () => {
    if (!trimmedText || sending) {
      refocusTextarea();
      return;
    }

    const outgoingText = trimmedText;

    setSending(true);
    stopTyping();
    setText("");
    textSelectionRef.current = { start: 0, end: 0 };
    clearComposerError();
    resetTextAreaHeight();
    onClearReply?.();
    refocusTextarea();

    try {
      await sendTextMessage(outgoingText, replyTo);
    } catch (error) {
      logger.error("Send failed:", error);
      restoreTextAfterFailedSend(outgoingText);
      setComposerErrorKey(
        isGroupComposer
          ? "groupSendFailed"
          : resolveComposerErrorKey(error, "sendFailed")
      );
    } finally {
      setSending(false);
      refocusTextarea();
    }
  }, [
    clearComposerError,
    isGroupComposer,
    onClearReply,
    refocusTextarea,
    replyTo,
    resetTextAreaHeight,
    restoreTextAfterFailedSend,
    sendTextMessage,
    sending,
    stopTyping,
    trimmedText,
  ]);

  const handleDroppedFiles = useCallback(async (files: File[], caption?: string) => {
    if (!files.length) return;

    // When sending multiple inline-media files together, stamp them with a
    // shared mediaGroupId so the receiver can display them as a single album.
    const inlineMediaFiles = files.filter((f) =>
      f.type.startsWith("image/") || f.type.startsWith("video/")
    );
    const mediaGroupId =
      inlineMediaFiles.length > 1 && inlineMediaFiles.length === files.length
        ? crypto.randomUUID()
        : undefined;

    setSending(true);
    clearComposerError();
    try {
      const trimmedCaption = caption?.trim();
      const results = await Promise.allSettled(
        files.map((file, index) => {
          const fileGroupId =
            mediaGroupId && (file.type.startsWith("image/") || file.type.startsWith("video/"))
              ? mediaGroupId
              : undefined;
          return sendFileAttachmentAction(
            file,
            fileGroupId,
            index === 0 ? trimmedCaption : undefined
          );
        })
      );

      const firstRejected = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      if (firstRejected) {
        throw firstRejected.reason;
      }

    } catch (error) {
      logger.error("Attachment send failed:", error);
      setComposerErrorKey(resolveComposerErrorKey(error, "attachmentSendFailed"));
    } finally {
      setSending(false);
      refocusTextarea();
    }
  }, [clearComposerError, refocusTextarea, sendFileAttachmentAction]);

  const handleAttachmentSelected = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    await handleDroppedFiles(files);
  }, [handleDroppedFiles]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  useEffect(() => {
    return () => {
      cleanupTypingSignal();
    };
  }, [cleanupTypingSignal]);

  return {
    attachmentInputRef,
    clearComposerError,
    composerErrorKey,
    handleDroppedFiles,
    handleAttachmentSelected,
    handleInput,
    handleKeyDown,
    handleRecordingError,
    handleSend,
    handleTextBlur,
    handleTextFocus,
    insertTextAtSelection,
    isGroupComposer,
    isTextFocused,
    refocusTextarea,
    sendVideoBlob,
    sendVoiceBlob,
    sending,
    setComposerErrorKey,
    syncTextareaSelection,
    text,
    textareaRef,
    textSelectionRef,
    trimmedText,
  };
}

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
  const [isTextFocused, setIsTextFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const textSelectionRef = useRef({ start: 0, end: 0 });
  const trimmedText = text.trim();

  const { handleTypingState, stopTyping, cleanupTypingSignal } = useChatComposerTypingSignal({
    recipientUserId,
    groupId,
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

  const resizeTextAreaToContent = useCallback(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
  }, []);

  const resetTextAreaHeight = useCallback(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
  }, []);

  const refocusTextarea = useCallback(() => {
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, []);

  const syncTextareaSelection = useCallback(() => {
    if (!textareaRef.current) return;
    textSelectionRef.current = {
      start: textareaRef.current.selectionStart,
      end: textareaRef.current.selectionEnd,
    };
  }, []);

  const clearComposerError = useCallback(() => {
    setComposerErrorKey(null);
  }, []);

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

  const insertTextAtSelection = useCallback((value: string) => {
    if (sending) return;

    const currentValue = textareaRef.current?.value ?? text;
    const start = Math.min(textSelectionRef.current.start, currentValue.length);
    const end = Math.min(textSelectionRef.current.end, currentValue.length);
    const nextValue = `${currentValue.slice(0, start)}${value}${currentValue.slice(end)}`;
    const nextCaretPosition = start + value.length;

    setText(nextValue);
    handleTypingState(nextValue);
    clearComposerError();
    textSelectionRef.current = {
      start: nextCaretPosition,
      end: nextCaretPosition,
    };

    setTimeout(() => {
      resizeTextAreaToContent();
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(nextCaretPosition, nextCaretPosition);
    }, 0);
  }, [clearComposerError, handleTypingState, resizeTextAreaToContent, sending, text]);

  const handleInput = useCallback((event: FormEvent<HTMLTextAreaElement>) => {
    const nextValue = event.currentTarget.value;
    setText(nextValue);
    handleTypingState(nextValue);
    clearComposerError();
    textSelectionRef.current = {
      start: event.currentTarget.selectionStart,
      end: event.currentTarget.selectionEnd,
    };
    event.currentTarget.style.height = "auto";
    event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 160)}px`;
  }, [clearComposerError, handleTypingState]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }, [handleSend]);

  const handleTextFocus = useCallback(() => {
    setIsTextFocused(true);
    onFocusChange?.(true);
    clearComposerError();
    syncTextareaSelection();
  }, [clearComposerError, onFocusChange, syncTextareaSelection]);

  const handleTextBlur = useCallback(() => {
    setIsTextFocused(false);
    onFocusChange?.(false);
    stopTyping();
  }, [onFocusChange, stopTyping]);

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

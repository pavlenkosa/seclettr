import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
} from "react";
import type { GifResult } from "../composer/composer-gif-service";
import { useI18n } from "@/i18n";
import { hapticImpactLight } from "@/lib/native-haptics";
import type { MessageReplyMeta } from "@/stores/messages";
import {
  resolvePrimaryComposerAction,
} from "../composer";
import { useComposerRecording } from "../composer/useComposerRecording";
import { useMessageComposerDraft } from "../composer/useMessageComposerDraft";
import { useMessageComposerEmojiState } from "../composer/useMessageComposerEmojiState";
import { useMediaSendDialog } from "../composer/useMediaSendDialog";
import {
  getComposerErrorMessage,
  getCurrentRecordMode,
  getPrimaryButtonCopy,
  getRecordingCopy,
  getRecordModeLabel,
  useMediaDialogMountState,
} from "./composer/message-composer-view-model";
import { MessageComposerShell } from "./composer/MessageComposerShell";

interface Props {
  readonly recipientUserId?: string;
  readonly groupId?: string;
  readonly onFocusChange?: (focused: boolean) => void;
  readonly replyTo?: MessageReplyMeta;
  readonly onClearReply?: () => void;
  readonly onSendText?: (text: string, replyTo?: MessageReplyMeta) => Promise<void>;
  readonly onSendFile?: (file: File, mediaGroupId?: string, caption?: string) => Promise<void>;
  readonly onSendVoiceBlob?: (blob: Blob, durationMs: number) => Promise<void>;
  readonly onSendVideoBlob?: (blob: Blob, durationMs: number) => Promise<void>;
  readonly isGroupComposer?: boolean;
  readonly placeholder?: string;
  readonly supportsGif?: boolean;
}

export interface MessageComposerHandle {
  handleDroppedFiles: (files: File[]) => Promise<void>;
}

const MessageComposerView = forwardRef<MessageComposerHandle, Props>(function MessageComposer({
  recipientUserId,
  groupId,
  onFocusChange,
  replyTo,
  onClearReply,
  onSendText,
  onSendFile,
  onSendVoiceBlob,
  onSendVideoBlob,
  isGroupComposer: isGroupComposerOverride,
  placeholder: placeholderOverride,
  supportsGif = false,
}, ref) {
  const { t } = useI18n();
  const emojiPickerId = useId();

  const draft = useMessageComposerDraft({
    recipientUserId,
    groupId,
    onFocusChange,
    replyTo,
    onClearReply,
    onSendText,
    onSendFile,
    onSendVoiceBlob,
    onSendVideoBlob,
  });

  const isGroupComposer = isGroupComposerOverride ?? draft.isGroupComposer;

  const mediaSend = useMediaSendDialog({
    onSendFiles: draft.handleDroppedFiles,
  });
  const dialogState = useMediaDialogMountState(mediaSend.isOpen);

  const {
    recordingKind,
    preferredRecordMode,
    recordingSeconds,
    recordingWaveformBars,
    isRecordHintVisible,
    previewVideoRef,
    startRecording,
    stopCurrentRecording,
    cleanupRecording,
    handleRecordModeToggle: toggleRecordMode,
  } = useComposerRecording({
    sending: draft.sending,
    onSendVoiceBlob: draft.sendVoiceBlob,
    onSendVideoBlob: draft.sendVideoBlob,
    onRecordingError: draft.handleRecordingError,
  });

  const isVideoRecording = recordingKind === "video";
  const isRecording = recordingKind !== null;

  const handleSendGif = useCallback(async (gifUrl: string, filename: string) => {
    if (!onSendFile) return;
    const response = await fetch(gifUrl);
    const blob = await response.blob();
    const file = new File([blob], filename, { type: blob.type || "image/gif" });
    await onSendFile(file);
  }, [onSendFile]);

  const emojiState = useMessageComposerEmojiState({
    sending: draft.sending,
    isRecording,
    textareaRef: draft.textareaRef,
    syncTextareaSelection: draft.syncTextareaSelection,
    insertTextAtSelection: draft.insertTextAtSelection,
    clearComposerError: draft.clearComposerError,
    supportsGif,
    onSendGif: supportsGif ? handleSendGif : undefined,
  });

  useImperativeHandle(ref, () => ({
    handleDroppedFiles: async (files: File[]) => {
      mediaSend.openDialog(files);
    },
  }), [mediaSend]);

  useEffect(() => {
    return () => {
      cleanupRecording();
    };
  }, [cleanupRecording]);

  const primaryAction = resolvePrimaryComposerAction({
    trimmedText: draft.trimmedText,
    isFocused: draft.isTextFocused,
    isGroupComposer,
    preferredRecordMode,
  });

  const handlePrimaryActionClick = useCallback(() => {
    if (isRecording) {
      stopCurrentRecording();
      return;
    }

    if (primaryAction.kind === "send") {
      emojiState.closeEmojiPicker();
      hapticImpactLight();
      void draft.handleSend();
      return;
    }

    draft.clearComposerError();
    emojiState.closeEmojiPicker();
    void startRecording(primaryAction.mode);
  }, [
    draft,
    emojiState,
    isRecording,
    primaryAction,
    startRecording,
    stopCurrentRecording,
  ]);

  const handleRecordModeToggle = useCallback(() => {
    if (primaryAction.kind !== "record") return;
    draft.clearComposerError();
    toggleRecordMode();
  }, [draft, primaryAction.kind, toggleRecordMode]);

  const handleCancelRecording = useCallback(() => {
    stopCurrentRecording({ discard: true });
  }, [stopCurrentRecording]);

  const composerError =
    mediaSend.validationError
      ? t(`composer.error.${mediaSend.validationError}`)
      : getComposerErrorMessage(draft.composerErrorKey, t);
  const currentRecordMode = getCurrentRecordMode(primaryAction, preferredRecordMode);
  const currentRecordModeLabel = getRecordModeLabel(currentRecordMode, t);
  const nextRecordMode = currentRecordMode === "voice" ? "video" : "voice";
  const nextRecordModeLabel = getRecordModeLabel(nextRecordMode, t);
  const recordingCopy = getRecordingCopy(isVideoRecording, recordingSeconds, t);
  const primaryButtonCopy = getPrimaryButtonCopy({
    isRecording,
    primaryAction,
    currentRecordModeLabel,
    isGroupComposer,
    t,
  });

  const primaryButtonDisabled = isRecording ? false : draft.sending;
  const showRecordModeChip = !isRecording && primaryAction.kind === "record";
  const composerPlaceholder = placeholderOverride
    ?? (isGroupComposer ? t("group.composer.placeholder") : t("composer.placeholder.default"));
  const composerAriaLabel = isGroupComposer
    ? t("group.composer.aria.typeMessage")
    : t("composer.aria.typeMessage");

  return (
    <MessageComposerShell
      isTextFocused={draft.isTextFocused}
      replyTo={replyTo}
      onClearReply={onClearReply}
      clearReplyLabel={t("message.context.clearReply")}
      isVideoRecording={isVideoRecording}
      previewVideoRef={previewVideoRef}
      recordingCopy={recordingCopy}
      isRecording={isRecording}
      recordingWaveformBars={recordingWaveformBars}
      emojiPickerId={emojiPickerId}
      draft={draft}
      mediaSend={mediaSend}
      emojiState={emojiState}
      attachTitle={t("composer.title.attachFile")}
      attachLabel={t("composer.aria.attachFile")}
      placeholder={composerPlaceholder}
      textareaLabel={composerAriaLabel}
      primaryAction={primaryAction}
      showRecordModeChip={showRecordModeChip}
      isRecordHintVisible={isRecordHintVisible}
      recordHintText={t("composer.hint.switchRecordMode")}
      currentRecordMode={currentRecordMode}
      currentRecordModeLabel={currentRecordModeLabel}
      recordModeToggleAriaLabel={t("composer.aria.switchRecordMode", { mode: nextRecordModeLabel })}
      recordModeToggleTitle={t("composer.title.switchRecordMode", { mode: nextRecordModeLabel })}
      primaryButtonDisabled={primaryButtonDisabled}
      cancelRecordingAriaLabel={t("composer.aria.cancelRecording")}
      cancelRecordingTitle={t("composer.title.cancelRecording")}
      primaryButtonAriaLabel={primaryButtonCopy.ariaLabel}
      primaryButtonTitle={primaryButtonCopy.title}
      onToggleRecordMode={handleRecordModeToggle}
      onCancelRecording={handleCancelRecording}
      onPrimaryActionClick={handlePrimaryActionClick}
      composerError={composerError}
      dialogState={dialogState}
    />
  );
});

MessageComposerView.displayName = "MessageComposer";

export const MessageComposer = memo(MessageComposerView);

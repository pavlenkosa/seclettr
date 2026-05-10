import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useI18n } from "@/i18n";
import type { MessageReplyMeta } from "@/stores/messages";
import {
  MessageComposerPrimaryActions,
  MessageComposerVideoRecordingOverlay,
  resolvePrimaryComposerAction,
  type RecordMode,
} from "../composer";
import { useComposerRecording } from "../composer/useComposerRecording";
import { useMessageComposerDraft } from "../composer/useMessageComposerDraft";
import { useMessageComposerEmojiState } from "../composer/useMessageComposerEmojiState";
import { useMediaSendDialog } from "../composer/useMediaSendDialog";
import {
  ComposerBody,
  ComposerErrorMessage,
  HiddenAttachmentInput,
  MountedMediaSendDialog,
  ReplyPreview,
  type DialogState,
  type RecordingCopy,
} from "./composer/MessageComposerParts";
import { formatClock } from "./message-list/message-list-presentation";
import styles from "./MessageComposer.module.css";

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
}

export interface MessageComposerHandle {
  handleDroppedFiles: (files: File[]) => Promise<void>;
}

type ComposerDraft = ReturnType<typeof useMessageComposerDraft>;
type PrimaryComposerAction = ReturnType<typeof resolvePrimaryComposerAction>;

interface PrimaryButtonCopy {
  ariaLabel: string;
  title: string;
}

function useMediaDialogMountState(isOpen: boolean): DialogState {
  const [dialogState, setDialogState] = useState<DialogState>("closed");
  const dialogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (dialogTimerRef.current) clearTimeout(dialogTimerRef.current);
      setDialogState("open");
    } else {
      setDialogState((prev) => {
        if (prev !== "open") return prev;
        dialogTimerRef.current = setTimeout(() => setDialogState("closed"), 210);
        return "closing";
      });
    }

    return () => {
      if (dialogTimerRef.current) clearTimeout(dialogTimerRef.current);
    };
  }, [isOpen]);

  return dialogState;
}

function getComposerErrorMessage(
  key: ComposerDraft["composerErrorKey"],
  t: ReturnType<typeof useI18n>["t"]
): string | null {
  if (!key) {
    return null;
  }

  if (key === "groupSendFailed") {
    return t("group.composer.error.sendFailed");
  }

  return key === "groupMediaUnsupported"
    ? t("group.composer.error.mediaUnsupported")
    : t(`composer.error.${key}`);
}

function getRecordModeLabel(mode: RecordMode, t: ReturnType<typeof useI18n>["t"]): string {
  return t(mode === "voice"
    ? "composer.recordMode.voice"
    : "composer.recordMode.video");
}

function getCurrentRecordMode(
  primaryAction: PrimaryComposerAction,
  preferredRecordMode: RecordMode
): RecordMode {
  return primaryAction.kind === "record"
    ? primaryAction.mode
    : preferredRecordMode;
}

function getRecordingCopy(
  isVideoRecording: boolean,
  recordingSeconds: number,
  t: ReturnType<typeof useI18n>["t"]
): RecordingCopy {
  const elapsedLabel = formatClock(recordingSeconds);

  return {
    elapsedLabel,
    stageTitle: t(isVideoRecording
      ? "composer.recordingStage.videoTitle"
      : "composer.recordingStage.voiceTitle"),
    stageStatus: t(
      isVideoRecording ? "composer.recordingVideo" : "composer.recording",
      { time: elapsedLabel }
    ),
    stageHint: t("composer.recordingStage.stopHint"),
  };
}

function getPrimaryButtonCopy(params: {
  isRecording: boolean;
  primaryAction: PrimaryComposerAction;
  currentRecordModeLabel: string;
  isGroupComposer: boolean;
  t: ReturnType<typeof useI18n>["t"];
}): PrimaryButtonCopy {
  const { isRecording, primaryAction, currentRecordModeLabel, isGroupComposer, t } = params;

  if (isRecording) {
    return {
      ariaLabel: t("composer.aria.stopRecording"),
      title: t("composer.title.stopRecording"),
    };
  }

  if (primaryAction.kind === "send") {
    const key = isGroupComposer
      ? "group.composer.aria.sendMessage"
      : "composer.aria.sendMessage";
    const label = t(key);
    return { ariaLabel: label, title: label };
  }

  return {
    ariaLabel: t("composer.aria.startRecording", { mode: currentRecordModeLabel }),
    title: t("composer.title.startRecording", { mode: currentRecordModeLabel }),
  };
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

  const emojiState = useMessageComposerEmojiState({
    sending: draft.sending,
    isRecording,
    textareaRef: draft.textareaRef,
    syncTextareaSelection: draft.syncTextareaSelection,
    insertTextAtSelection: draft.insertTextAtSelection,
    clearComposerError: draft.clearComposerError,
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
  const composerPlaceholder = isGroupComposer
    ? t("group.composer.placeholder")
    : t("composer.placeholder.default");
  const composerAriaLabel = isGroupComposer
    ? t("group.composer.aria.typeMessage")
    : t("composer.aria.typeMessage");

  return (
    <div className={`${styles.composer} ${draft.isTextFocused ? styles.composerFocused : ""}`}>
      <ReplyPreview
        replyTo={replyTo}
        onClearReply={onClearReply}
        clearLabel={t("message.context.clearReply")}
      />

      {isVideoRecording ? (
        <MessageComposerVideoRecordingOverlay
          previewVideoRef={previewVideoRef}
          recordingStageTitle={recordingCopy.stageTitle}
          recordingStageStatus={recordingCopy.stageStatus}
          recordingElapsedLabel={recordingCopy.elapsedLabel}
          recordingStageHint={recordingCopy.stageHint}
          cancelRecordingAriaLabel={t("composer.aria.cancelRecording")}
          cancelRecordingTitle={t("composer.title.cancelRecording")}
          stopRecordingAriaLabel={t("composer.aria.stopRecording")}
          stopRecordingTitle={t("composer.title.stopRecording")}
          onCancelRecording={handleCancelRecording}
          onStopRecording={handlePrimaryActionClick}
        />
      ) : null}

      <div className={`${styles.inner} ${isRecording ? styles.innerRecording : ""}`}>
        <HiddenAttachmentInput draft={draft} mediaSend={mediaSend} />
        <ComposerBody
          isRecording={isRecording}
          isVideoRecording={isVideoRecording}
          recordingCopy={recordingCopy}
          recordingWaveformBars={recordingWaveformBars}
          emojiPickerId={emojiPickerId}
          draft={draft}
          emojiState={emojiState}
          attachTitle={t("composer.title.attachFile")}
          attachLabel={t("composer.aria.attachFile")}
          placeholder={composerPlaceholder}
          textareaLabel={composerAriaLabel}
        />

        <MessageComposerPrimaryActions
          primaryAction={primaryAction}
          isRecording={isRecording}
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
          onSendMouseDown={draft.refocusTextarea}
        />
      </div>

      <ComposerErrorMessage message={composerError} />
      <MountedMediaSendDialog dialogState={dialogState} mediaSend={mediaSend} />
    </div>
  );
});

MessageComposerView.displayName = "MessageComposer";

export const MessageComposer = memo(MessageComposerView);

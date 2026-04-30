import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { useI18n } from "@/i18n";
import { IconButton } from "@/components/ui";
import type { MessageReplyMeta } from "@/stores/messages";
import {
  MessageComposerEmojiPicker,
  MessageComposerPrimaryActions,
  MessageComposerRecordingSurface,
  MessageComposerVideoRecordingOverlay,
  resolvePrimaryComposerAction,
  type RecordMode,
} from "../composer";
import { useComposerRecording } from "../composer/useComposerRecording";
import { useMessageComposerDraft } from "../composer/useMessageComposerDraft";
import { useMessageComposerEmojiState } from "../composer/useMessageComposerEmojiState";
import { useMediaSendDialog } from "../composer/useMediaSendDialog";
import { MediaSendDialog } from "./MediaSendDialog";
import { formatClock } from "./message-list/message-list-presentation";
import styles from "./MessageComposer.module.css";

interface Props {
  readonly recipientUserId?: string;
  readonly groupId?: string;
  readonly onFocusChange?: (focused: boolean) => void;
  readonly replyTo?: MessageReplyMeta;
  readonly onClearReply?: () => void;
}

export interface MessageComposerHandle {
  handleDroppedFiles: (files: File[]) => Promise<void>;
}

type ComposerDraft = ReturnType<typeof useMessageComposerDraft>;
type ComposerEmojiState = ReturnType<typeof useMessageComposerEmojiState>;
type MediaSendState = ReturnType<typeof useMediaSendDialog>;
type PrimaryComposerAction = ReturnType<typeof resolvePrimaryComposerAction>;
type DialogState = "closed" | "open" | "closing";

interface RecordingCopy {
  elapsedLabel: string;
  stageTitle: string;
  stageStatus: string;
  stageHint: string;
}

interface PrimaryButtonCopy {
  ariaLabel: string;
  title: string;
}

type ReplyPreviewProps = Readonly<{
  replyTo?: MessageReplyMeta;
  onClearReply?: () => void;
  clearLabel: string;
}>;

type HiddenAttachmentInputProps = Readonly<{
  draft: ComposerDraft;
  mediaSend: MediaSendState;
}>;

type AttachmentButtonProps = Readonly<{
  draft: ComposerDraft;
  attachTitle: string;
  attachLabel: string;
}>;

type ComposerTextAreaProps = Readonly<{
  draft: ComposerDraft;
  emojiState: ComposerEmojiState;
  placeholder: string;
  ariaLabel: string;
}>;

type EmojiPickerControlProps = Readonly<{
  emojiPickerId: string;
  draft: ComposerDraft;
  emojiState: ComposerEmojiState;
}>;

type IdleComposerControlsProps = Readonly<{
  emojiPickerId: string;
  draft: ComposerDraft;
  emojiState: ComposerEmojiState;
  attachTitle: string;
  attachLabel: string;
  placeholder: string;
  textareaLabel: string;
}>;

type ComposerBodyProps = Readonly<{
  isRecording: boolean;
  isVideoRecording: boolean;
  recordingCopy: RecordingCopy;
  recordingWaveformBars: number[];
  emojiPickerId: string;
  draft: ComposerDraft;
  emojiState: ComposerEmojiState;
  attachTitle: string;
  attachLabel: string;
  placeholder: string;
  textareaLabel: string;
}>;

type ComposerErrorMessageProps = Readonly<{ message: string | null }>;

type MountedMediaSendDialogProps = Readonly<{
  dialogState: DialogState;
  mediaSend: MediaSendState;
}>;

function useMediaDialogMountState(isOpen: boolean): DialogState {
  const [dialogState, setDialogState] = useState<DialogState>("closed");
  const dialogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (dialogTimerRef.current) clearTimeout(dialogTimerRef.current);
      setDialogState("open");
    } else if (dialogState === "open") {
      setDialogState("closing");
      dialogTimerRef.current = setTimeout(() => setDialogState("closed"), 210);
    }

    return () => {
      if (dialogTimerRef.current) clearTimeout(dialogTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

function ReplyPreview({
  replyTo,
  onClearReply,
  clearLabel,
}: ReplyPreviewProps) {
  if (!replyTo) {
    return null;
  }

  return (
    <div className={styles.replyPreview}>
      <div className={styles.replyPreviewContent}>
        {replyTo.senderName ? (
          <span className={styles.replyPreviewSender}>{replyTo.senderName}</span>
        ) : null}
        <span className={styles.replyPreviewText}>{replyTo.content}</span>
      </div>
      <button
        type="button"
        className={styles.replyPreviewClose}
        onClick={onClearReply}
        aria-label={clearLabel}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path
            d="M2 2l8 8M10 2L2 10"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

function HiddenAttachmentInput({
  draft,
  mediaSend,
}: HiddenAttachmentInputProps) {
  const handleAttachmentChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length) mediaSend.openDialog(files);
  };

  return (
    <input
      ref={draft.attachmentInputRef}
      type="file"
      multiple
      onChange={handleAttachmentChange}
      className={styles.hiddenInput}
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}

function AttachmentButton({
  draft,
  attachTitle,
  attachLabel,
}: AttachmentButtonProps) {
  return (
    <IconButton
      onClick={() => draft.attachmentInputRef.current?.click()}
      disabled={draft.sending}
      className={styles.secondaryBtn}
      variant="glass"
      title={attachTitle}
      aria-label={attachLabel}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M6 8.8 9.78 5a2.3 2.3 0 0 1 3.25 3.25l-5.5 5.49a3.8 3.8 0 0 1-5.38-5.37L8.5 2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </IconButton>
  );
}

function ComposerTextArea({
  draft,
  emojiState,
  placeholder,
  ariaLabel,
}: ComposerTextAreaProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      emojiState.closeEmojiPicker();
    }
    draft.handleKeyDown(event);
  };

  return (
    <div className={styles.textField}>
      <textarea
        ref={draft.textareaRef}
        className={styles.textarea}
        value={draft.text}
        onInput={draft.handleInput}
        onSelect={draft.syncTextareaSelection}
        onClick={draft.syncTextareaSelection}
        onKeyDown={handleKeyDown}
        onFocus={draft.handleTextFocus}
        onBlur={draft.handleTextBlur}
        placeholder={placeholder}
        rows={1}
        maxLength={65536}
        aria-label={ariaLabel}
      />
    </div>
  );
}

function EmojiPickerControl({
  emojiPickerId,
  draft,
  emojiState,
}: EmojiPickerControlProps) {
  return (
    <MessageComposerEmojiPicker
      isOpen={emojiState.isEmojiPickerOpen}
      disabled={draft.sending}
      pickerId={emojiPickerId}
      searchQuery={emojiState.emojiSearchQuery}
      isSearchActive={emojiState.isEmojiSearchActive}
      emojiTabs={emojiState.emojiTabs}
      activeEmojiGroupId={emojiState.activeEmojiGroupId}
      activeEmojiGroup={emojiState.activeEmojiGroup}
      activeEmojiSubgroup={emojiState.activeEmojiSubgroup}
      visibleEmojiItems={emojiState.visibleEmojiItems}
      toggleButtonRef={emojiState.emojiToggleButtonRef}
      pickerRef={emojiState.emojiPickerRef}
      viewportRef={emojiState.emojiViewportRef}
      onToggleMouseDown={emojiState.handleEmojiToggleMouseDown}
      onToggleOpen={emojiState.handleEmojiToggleOpen}
      onSearchQueryChange={emojiState.setEmojiSearchQuery}
      onSelectEmojiGroup={emojiState.setActiveEmojiGroupId}
      onSelectEmojiSubgroup={(subgroupId) => emojiState.setActiveEmojiSubgroupId(subgroupId)}
      onInsertEmoji={emojiState.insertEmoji}
    />
  );
}

function IdleComposerControls({
  emojiPickerId,
  draft,
  emojiState,
  attachTitle,
  attachLabel,
  placeholder,
  textareaLabel,
}: IdleComposerControlsProps) {
  return (
    <>
      <AttachmentButton draft={draft} attachTitle={attachTitle} attachLabel={attachLabel} />
      <EmojiPickerControl emojiPickerId={emojiPickerId} draft={draft} emojiState={emojiState} />
      <ComposerTextArea
        draft={draft}
        emojiState={emojiState}
        placeholder={placeholder}
        ariaLabel={textareaLabel}
      />
    </>
  );
}

function ComposerBody({
  isRecording,
  isVideoRecording,
  recordingCopy,
  recordingWaveformBars,
  emojiPickerId,
  draft,
  emojiState,
  attachTitle,
  attachLabel,
  placeholder,
  textareaLabel,
}: ComposerBodyProps) {
  if (isRecording) {
    return (
      <MessageComposerRecordingSurface
        isVideoRecording={isVideoRecording}
        recordingStageTitle={recordingCopy.stageTitle}
        recordingStageStatus={recordingCopy.stageStatus}
        recordingStageHint={recordingCopy.stageHint}
        recordingElapsedLabel={recordingCopy.elapsedLabel}
        recordingWaveformBars={recordingWaveformBars}
      />
    );
  }

  return (
    <IdleComposerControls
      emojiPickerId={emojiPickerId}
      draft={draft}
      emojiState={emojiState}
      attachTitle={attachTitle}
      attachLabel={attachLabel}
      placeholder={placeholder}
      textareaLabel={textareaLabel}
    />
  );
}

function ComposerErrorMessage({ message }: ComposerErrorMessageProps) {
  return message ? (
    <div className={styles.error} role="alert">
      {message}
    </div>
  ) : null;
}

function MountedMediaSendDialog({
  dialogState,
  mediaSend,
}: MountedMediaSendDialogProps) {
  if (dialogState === "closed") {
    return null;
  }

  return (
    <MediaSendDialog
      pendingFiles={mediaSend.pendingFiles}
      caption={mediaSend.caption}
      quality={mediaSend.quality}
      isSending={mediaSend.isSending}
      totalOriginalSize={mediaSend.totalOriginalSize}
      totalCompressedSize={mediaSend.totalCompressedSize}
      hasCompressible={mediaSend.hasCompressible}
      canConfirmSend={mediaSend.canConfirmSend}
      removeFile={mediaSend.removeFile}
      setCaption={mediaSend.setCaption}
      setQuality={mediaSend.setQuality}
      confirmSend={mediaSend.confirmSend}
      closeDialog={mediaSend.closeDialog}
      isExiting={dialogState === "closing"}
    />
  );
}


const MessageComposerView = forwardRef<MessageComposerHandle, Props>(function MessageComposer({
  recipientUserId,
  groupId,
  onFocusChange,
  replyTo,
  onClearReply,
}, ref) {
  const { t } = useI18n();
  const emojiPickerId = useId();

  const draft = useMessageComposerDraft({
    recipientUserId,
    groupId,
    onFocusChange,
    replyTo,
    onClearReply,
  });

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
    isGroupComposer: draft.isGroupComposer,
    preferredRecordMode,
  });

  const handlePrimaryActionClick = useCallback(() => {
    if (isRecording) {
      stopCurrentRecording();
      return;
    }

    if (primaryAction.kind === "send") {
      emojiState.closeEmojiPicker();
      draft.handleSend();
      return;
    }

    draft.clearComposerError();
    emojiState.closeEmojiPicker();
    startRecording(primaryAction.mode);
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
    isGroupComposer: draft.isGroupComposer,
    t,
  });

  const primaryButtonDisabled = isRecording ? false : draft.sending;
  const showRecordModeChip = !isRecording && primaryAction.kind === "record";
  const composerPlaceholder = draft.isGroupComposer
    ? t("group.composer.placeholder")
    : t("composer.placeholder.default");
  const composerAriaLabel = draft.isGroupComposer
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

import { lazy, Suspense, type ChangeEvent, type KeyboardEvent } from "react";
import { IconButton } from "@/components/ui";
import type { MessageReplyMeta } from "@/stores/messages";
import {
  MessageComposerEmojiPicker,
  MessageComposerRecordingSurface,
} from "../../composer";
import type { UseMessageComposerDraftResult } from "../../composer/useMessageComposerDraft";
import type { UseMessageComposerEmojiStateResult } from "../../composer/useMessageComposerEmojiState";
import type { UseMediaSendDialogResult } from "../../composer/useMediaSendDialog";
import type { MediaSendDialogProps } from "../MediaSendDialog";
import styles from "../MessageComposer.module.css";

const MediaSendDialog = lazy(() =>
  import("../MediaSendDialog").then(({ MediaSendDialog: Component }) => ({
    default: Component,
  }))
);

export type DialogState = "closed" | "open" | "closing";

export interface RecordingCopy {
  elapsedLabel: string;
  stageTitle: string;
  stageStatus: string;
  stageHint: string;
}

type ReplyPreviewProps = Readonly<{
  replyTo?: MessageReplyMeta;
  onClearReply?: () => void;
  clearLabel: string;
}>;

type HiddenAttachmentInputProps = Readonly<{
  draft: UseMessageComposerDraftResult;
  mediaSend: UseMediaSendDialogResult;
}>;

type AttachmentButtonProps = Readonly<{
  draft: UseMessageComposerDraftResult;
  attachTitle: string;
  attachLabel: string;
}>;

type ComposerTextAreaProps = Readonly<{
  draft: UseMessageComposerDraftResult;
  emojiState: UseMessageComposerEmojiStateResult;
  placeholder: string;
  ariaLabel: string;
}>;

type EmojiPickerControlProps = Readonly<{
  emojiPickerId: string;
  draft: UseMessageComposerDraftResult;
  emojiState: UseMessageComposerEmojiStateResult;
}>;

type IdleComposerControlsProps = Readonly<{
  emojiPickerId: string;
  draft: UseMessageComposerDraftResult;
  emojiState: UseMessageComposerEmojiStateResult;
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
  draft: UseMessageComposerDraftResult;
  emojiState: UseMessageComposerEmojiStateResult;
  attachTitle: string;
  attachLabel: string;
  placeholder: string;
  textareaLabel: string;
}>;

type ComposerErrorMessageProps = Readonly<{ message: string | null }>;

type MountedMediaSendDialogProps = Readonly<{
  dialogState: DialogState;
  mediaSend: UseMediaSendDialogResult;
}>;

export function ReplyPreview({
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

export function HiddenAttachmentInput({
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

export function ComposerBody({
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

export function ComposerErrorMessage({ message }: ComposerErrorMessageProps) {
  return message ? (
    <div className={styles.error} role="alert">
      {message}
    </div>
  ) : null;
}

export function MountedMediaSendDialog({
  dialogState,
  mediaSend,
}: MountedMediaSendDialogProps) {
  if (dialogState === "closed") {
    return null;
  }

  const dialogProps: MediaSendDialogProps = {
    pendingFiles: mediaSend.pendingFiles,
    caption: mediaSend.caption,
    quality: mediaSend.quality,
    isSending: mediaSend.isSending,
    totalOriginalSize: mediaSend.totalOriginalSize,
    totalCompressedSize: mediaSend.totalCompressedSize,
    hasCompressible: mediaSend.hasCompressible,
    canConfirmSend: mediaSend.canConfirmSend,
    removeFile: mediaSend.removeFile,
    setCaption: mediaSend.setCaption,
    setQuality: mediaSend.setQuality,
    confirmSend: mediaSend.confirmSend,
    closeDialog: mediaSend.closeDialog,
    isExiting: dialogState === "closing",
  };

  return (
    <Suspense fallback={null}>
      <MediaSendDialog {...dialogProps} />
    </Suspense>
  );
}

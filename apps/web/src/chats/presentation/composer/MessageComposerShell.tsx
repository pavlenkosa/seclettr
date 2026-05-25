import { useEffect, useRef, type RefObject } from "react";

import type { MessageReplyMeta } from "@/stores/messages";
import { MessageComposerPrimaryActions, MessageComposerVideoRecordingOverlay, type RecordMode } from "../../composer";
import type { UseMessageComposerDraftResult } from "../../composer/useMessageComposerDraft";
import type { UseMessageComposerEmojiStateResult } from "../../composer/useMessageComposerEmojiState";
import type { UseMediaSendDialogResult } from "../../composer/useMediaSendDialog";
import { useAttachmentPicker } from "../../composer/useAttachmentPicker";
import { ComposerBody } from "./MessageComposerBody";
import {
  ComposerErrorMessage,
  MountedMediaSendDialog,
} from "./MessageComposerDialogMount";
import { HiddenAttachmentInput } from "./MessageComposerHiddenAttachmentInput";
import { ReplyPreview } from "./MessageComposerReplyPreview";
import { AttachmentPickerSheet } from "../AttachmentPickerSheet";
import type { DialogState, RecordingCopy } from "./message-composer-view-model";
import styles from "../MessageComposer.module.css";

interface MessageComposerShellProps {
  readonly isTextFocused: boolean;
  readonly replyTo?: MessageReplyMeta;
  readonly onClearReply?: () => void;
  readonly clearReplyLabel: string;
  readonly isVideoRecording: boolean;
  readonly previewVideoRef: RefObject<HTMLVideoElement>;
  readonly recordingCopy: RecordingCopy;
  readonly isRecording: boolean;
  readonly recordingWaveformBars: number[];
  readonly emojiPickerId: string;
  readonly draft: UseMessageComposerDraftResult;
  readonly mediaSend: UseMediaSendDialogResult;
  readonly emojiState: UseMessageComposerEmojiStateResult;
  readonly attachTitle: string;
  readonly attachLabel: string;
  readonly pickerCameraLabel: string;
  readonly pickerGalleryLabel: string;
  readonly pickerFileLabel: string;
  readonly pickerCancelLabel: string;
  readonly placeholder: string;
  readonly textareaLabel: string;
  readonly primaryAction: { kind: "send" } | { kind: "record"; mode: RecordMode };
  readonly showRecordModeChip: boolean;
  readonly isRecordHintVisible: boolean;
  readonly recordHintText: string;
  readonly currentRecordMode: RecordMode;
  readonly currentRecordModeLabel: string;
  readonly recordModeToggleAriaLabel: string;
  readonly recordModeToggleTitle: string;
  readonly primaryButtonDisabled: boolean;
  readonly cancelRecordingAriaLabel: string;
  readonly cancelRecordingTitle: string;
  readonly primaryButtonAriaLabel: string;
  readonly primaryButtonTitle: string;
  readonly onToggleRecordMode: () => void;
  readonly onCancelRecording: () => void;
  readonly onPrimaryActionClick: () => void;
  readonly composerError: string | null;
  readonly dialogState: DialogState;
}

export function MessageComposerShell({
  isTextFocused,
  replyTo,
  onClearReply,
  clearReplyLabel,
  isVideoRecording,
  previewVideoRef,
  recordingCopy,
  isRecording,
  recordingWaveformBars,
  emojiPickerId,
  draft,
  mediaSend,
  emojiState,
  attachTitle,
  attachLabel,
  pickerCameraLabel,
  pickerGalleryLabel,
  pickerFileLabel,
  pickerCancelLabel,
  placeholder,
  textareaLabel,
  primaryAction,
  showRecordModeChip,
  isRecordHintVisible,
  recordHintText,
  currentRecordMode,
  currentRecordModeLabel,
  recordModeToggleAriaLabel,
  recordModeToggleTitle,
  primaryButtonDisabled,
  cancelRecordingAriaLabel,
  cancelRecordingTitle,
  primaryButtonAriaLabel,
  primaryButtonTitle,
  onToggleRecordMode,
  onCancelRecording,
  onPrimaryActionClick,
  composerError,
  dialogState,
}: MessageComposerShellProps) {
  const composerRef = useRef<HTMLDivElement>(null);

  const picker = useAttachmentPicker({
    onFilesReady: mediaSend.openDialog,
    fileInputRef: draft.attachmentInputRef,
  });

  // Track actual composer height so the fixed-position emoji picker on mobile
  // (which uses bottom: calc(safe-area + var(--composer-height, 72px))) always
  // sits above the composer, even when the textarea is multiline.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      el.style.setProperty("--composer-height", `${Math.round(el.offsetHeight)}px`);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={composerRef}
      className={`${styles.composer} ${isTextFocused ? styles.composerFocused : ""}`}
    >
      <ReplyPreview
        replyTo={replyTo}
        onClearReply={onClearReply}
        clearLabel={clearReplyLabel}
      />

      {isVideoRecording ? (
        <MessageComposerVideoRecordingOverlay
          previewVideoRef={previewVideoRef}
          recordingStageTitle={recordingCopy.stageTitle}
          recordingStageStatus={recordingCopy.stageStatus}
          recordingElapsedLabel={recordingCopy.elapsedLabel}
          recordingStageHint={recordingCopy.stageHint}
          cancelRecordingAriaLabel={cancelRecordingAriaLabel}
          cancelRecordingTitle={cancelRecordingTitle}
          stopRecordingAriaLabel={primaryButtonAriaLabel}
          stopRecordingTitle={primaryButtonTitle}
          onCancelRecording={onCancelRecording}
          onStopRecording={onPrimaryActionClick}
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
          onAttach={picker.openPicker}
          attachTitle={attachTitle}
          attachLabel={attachLabel}
          placeholder={placeholder}
          textareaLabel={textareaLabel}
        />

        <MessageComposerPrimaryActions
          primaryAction={primaryAction}
          isRecording={isRecording}
          showRecordModeChip={showRecordModeChip}
          isRecordHintVisible={isRecordHintVisible}
          recordHintText={recordHintText}
          currentRecordMode={currentRecordMode}
          currentRecordModeLabel={currentRecordModeLabel}
          recordModeToggleAriaLabel={recordModeToggleAriaLabel}
          recordModeToggleTitle={recordModeToggleTitle}
          primaryButtonDisabled={primaryButtonDisabled}
          cancelRecordingAriaLabel={cancelRecordingAriaLabel}
          cancelRecordingTitle={cancelRecordingTitle}
          primaryButtonAriaLabel={primaryButtonAriaLabel}
          primaryButtonTitle={primaryButtonTitle}
          onToggleRecordMode={onToggleRecordMode}
          onCancelRecording={onCancelRecording}
          onPrimaryActionClick={onPrimaryActionClick}
          onSendMouseDown={draft.refocusTextarea}
        />
      </div>

      <ComposerErrorMessage message={composerError} />
      <MountedMediaSendDialog dialogState={dialogState} mediaSend={mediaSend} />

      {picker.isSheetOpen && (
        <AttachmentPickerSheet
          isExiting={picker.isSheetExiting}
          onCamera={picker.onCamera}
          onGallery={picker.onGallery}
          onFile={picker.onFile}
          onClose={picker.closeSheet}
          cameraLabel={pickerCameraLabel}
          galleryLabel={pickerGalleryLabel}
          fileLabel={pickerFileLabel}
          cancelLabel={pickerCancelLabel}
        />
      )}
    </div>
  );
}

import { useEffect, useRef } from "react";

import { MessageComposerPrimaryActions, MessageComposerVideoRecordingOverlay } from "../../composer";
import { useAttachmentPicker } from "../../composer/useAttachmentPicker";
import { useComposerContext } from "./ComposerContext";
import { ComposerBody } from "./MessageComposerBody";
import {
  ComposerErrorMessage,
  MountedMediaSendDialog,
} from "./MessageComposerDialogMount";
import { HiddenAttachmentInput } from "./MessageComposerHiddenAttachmentInput";
import { ReplyPreview } from "./MessageComposerReplyPreview";
import { AttachmentPickerSheet } from "../AttachmentPickerSheet";
import styles from "../MessageComposer.module.css";

/**
 * MessageComposerShell — layout shell for the composer subtree.
 *
 * Reads all state and labels from `ComposerContext` (provided by
 * `MessageComposer`). No props — this eliminates the previous 39-prop
 * drilling surface (ARCH-01).
 */
export function MessageComposerShell() {
  const {
    replyTo,
    onClearReply,
    clearReplyLabel,
    isTextFocused,
    composerError,
    isRecording,
    isVideoRecording,
    recordingCopy,
    recordingWaveformBars,
    previewVideoRef,
    draft,
    emojiState,
    mediaSend,
    emojiPickerId,
    dialogState,
    primaryAction,
    showRecordModeChip,
    isRecordHintVisible,
    primaryButtonDisabled,
    currentRecordMode,
    onToggleRecordMode,
    onCancelRecording,
    onPrimaryActionClick,
    attachTitle,
    attachLabel,
    pickerCameraLabel,
    pickerGalleryLabel,
    pickerFileLabel,
    pickerCancelLabel,
    placeholder,
    textareaLabel,
    recordHintText,
    currentRecordModeLabel,
    recordModeToggleAriaLabel,
    recordModeToggleTitle,
    cancelRecordingAriaLabel,
    cancelRecordingTitle,
    primaryButtonAriaLabel,
    primaryButtonTitle,
  } = useComposerContext();

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

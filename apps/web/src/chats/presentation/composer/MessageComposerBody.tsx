import type { KeyboardEvent } from "react";

import { IconButton } from "@/components/ui";
import {
  MessageComposerEmojiPicker,
  MessageComposerRecordingSurface,
} from "../../composer";
import type { UseMessageComposerDraftResult } from "../../composer/useMessageComposerDraft";
import type { UseMessageComposerEmojiStateResult } from "../../composer/useMessageComposerEmojiState";
import type { RecordingCopy } from "./message-composer-view-model";
import styles from "../MessageComposer.module.css";

type AttachmentButtonProps = Readonly<{
  onAttach: () => void;
  disabled: boolean;
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
  onAttach: () => void;
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
  onAttach: () => void;
  attachTitle: string;
  attachLabel: string;
  placeholder: string;
  textareaLabel: string;
}>;

function AttachmentButton({
  onAttach,
  disabled,
  attachTitle,
  attachLabel,
}: AttachmentButtonProps) {
  return (
    <IconButton
      onClick={onAttach}
      disabled={disabled}
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
        enterKeyHint="send"
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
      emojiGroups={emojiState.emojiGroups}
      activeEmojiGroupId={emojiState.activeEmojiGroupId}
      activeEmojiGroup={emojiState.activeEmojiGroup}
      hasRecentEmojis={emojiState.hasRecentEmojis}
      recentEmojiItems={emojiState.recentEmojiItems}
      visibleEmojiItems={emojiState.visibleEmojiItems}
      toggleButtonRef={emojiState.emojiToggleButtonRef}
      pickerRef={emojiState.emojiPickerRef}
      viewportRef={emojiState.emojiViewportRef}
      onToggleMouseDown={emojiState.handleEmojiToggleMouseDown}
      onToggleOpen={emojiState.handleEmojiToggleOpen}
      onSearchQueryChange={emojiState.setEmojiSearchQuery}
      onSelectEmojiGroup={emojiState.setActiveEmojiGroupId}
      onInsertEmoji={emojiState.insertEmoji}
      isGifMode={emojiState.isGifMode}
      isGifTabAvailable={emojiState.isGifTabAvailable}
      gifQuery={emojiState.gifQuery}
      gifResults={emojiState.gifResults}
      isGifLoading={emojiState.isGifLoading}
      isSendingGif={emojiState.isSendingGif}
      onSetGifMode={emojiState.setGifMode}
      onSetGifQuery={emojiState.setGifQuery}
      onSendGif={emojiState.sendGif}
    />
  );
}

function IdleComposerControls({
  emojiPickerId,
  draft,
  emojiState,
  onAttach,
  attachTitle,
  attachLabel,
  placeholder,
  textareaLabel,
}: IdleComposerControlsProps) {
  return (
    <>
      <AttachmentButton onAttach={onAttach} disabled={draft.sending} attachTitle={attachTitle} attachLabel={attachLabel} />
      <ComposerTextArea
        draft={draft}
        emojiState={emojiState}
        placeholder={placeholder}
        ariaLabel={textareaLabel}
      />
      <EmojiPickerControl emojiPickerId={emojiPickerId} draft={draft} emojiState={emojiState} />
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
  onAttach,
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
      onAttach={onAttach}
      attachTitle={attachTitle}
      attachLabel={attachLabel}
      placeholder={placeholder}
      textareaLabel={textareaLabel}
    />
  );
}

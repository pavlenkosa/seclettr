import { memo } from "react";
import type { MouseEvent } from "react";
import { IconButton } from "@/components/ui";

import { VideoNoteIcon, VoiceNoteIcon } from "./MessageComposerIcons";

export type RecordMode = "voice" | "video";

export type ComposerPrimaryAction =
  | { kind: "send" }
  | { kind: "record"; mode: RecordMode };

export function resolvePrimaryComposerAction(params: {
  trimmedText: string;
  isFocused: boolean;
  isGroupComposer: boolean;
  preferredRecordMode: RecordMode;
}): ComposerPrimaryAction {
  if (params.isGroupComposer || params.trimmedText.length > 0 || params.isFocused) {
    return { kind: "send" };
  }

  return {
    kind: "record",
    mode: params.preferredRecordMode,
  };
}
import styles from "../presentation/MessageComposer.module.css";

/**
 * Props for the composer primary action cluster.
 */
export interface MessageComposerPrimaryActionsProps {
  readonly primaryAction: ComposerPrimaryAction;
  readonly isRecording: boolean;
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
  readonly onSendMouseDown: () => void;
}

/**
 * Controls mode switching, stop/cancel affordances, and the send/record primary button.
 */
export const MessageComposerPrimaryActions = memo(function MessageComposerPrimaryActions({
  primaryAction,
  isRecording,
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
  onSendMouseDown,
}: MessageComposerPrimaryActionsProps) {
  const recordModeIcon = primaryAction.kind === "record" && primaryAction.mode === "voice"
    ? <VoiceNoteIcon />
    : <VideoNoteIcon />;
  const primaryActionIcon = primaryAction.kind === "send" ? (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M16 9L2 2l4 7-4 7 14-7z" fill="currentColor" />
    </svg>
  ) : recordModeIcon;

  const handlePrimaryMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    if (primaryAction.kind !== "send") return;
    event.preventDefault();
    onSendMouseDown();
  };

  return (
    <div className={styles.primaryDock}>
      <div className={styles.primaryActions}>
        {showRecordModeChip ? (
          <div className={styles.recordModeStack}>
            {isRecordHintVisible ? (
              <div className={styles.recordHint} role="status" aria-live="polite">
                {recordHintText}
              </div>
            ) : null}
            <button
              type="button"
              onClick={onToggleRecordMode}
              disabled={primaryButtonDisabled}
              className={styles.recordModeChip}
              aria-label={recordModeToggleAriaLabel}
              title={recordModeToggleTitle}
            >
              <span className={styles.recordModeChipIcon} aria-hidden="true">
                {currentRecordMode === "voice" ? <VoiceNoteIcon size={14} /> : <VideoNoteIcon size={14} />}
              </span>
              <span>{currentRecordModeLabel}</span>
            </button>
          </div>
        ) : null}

        {isRecording ? (
          <IconButton
            onClick={onCancelRecording}
            className={styles.recordCancelButton}
            aria-label={cancelRecordingAriaLabel}
            title={cancelRecordingTitle}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4 4 12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </IconButton>
        ) : null}

        <button
          type="button"
          onClick={onPrimaryActionClick}
          onMouseDown={handlePrimaryMouseDown}
          disabled={primaryButtonDisabled}
          className={`${styles.sendBtn} ${
            primaryAction.kind === "record" && !isRecording ? styles.sendBtnRecordMode : ""
          } ${isRecording ? styles.sendBtnRecording : ""}`}
          aria-label={primaryButtonAriaLabel}
          title={primaryButtonTitle}
        >
          {isRecording ? (
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <rect x="4.25" y="4.25" width="9.5" height="9.5" rx="2.1" fill="currentColor" />
            </svg>
          ) : primaryActionIcon}
        </button>
      </div>
    </div>
  );
});


import { useEffect, useRef, useState } from "react";
import type { RecordMode } from "../../composer";
import { formatClock } from "../message-list/message-list-presentation";

export type DialogState = "closed" | "open" | "closing";

export interface RecordingCopy {
  elapsedLabel: string;
  stageTitle: string;
  stageStatus: string;
  stageHint: string;
}

interface PrimaryButtonCopy {
  ariaLabel: string;
  title: string;
}

type ComposerTranslateFn = (key: string, params?: Record<string, string | number>) => string;
type PrimaryComposerActionLike = { kind: "send" } | { kind: "record"; mode: RecordMode };

export function useMediaDialogMountState(isOpen: boolean): DialogState {
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

export function getComposerErrorMessage(
  key: string | null | undefined,
  t: ComposerTranslateFn
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

export function getCurrentRecordMode(
  primaryAction: PrimaryComposerActionLike,
  preferredRecordMode: RecordMode
): RecordMode {
  return primaryAction.kind === "record"
    ? primaryAction.mode
    : preferredRecordMode;
}

export function getRecordModeLabel(mode: RecordMode, t: ComposerTranslateFn): string {
  return t(mode === "voice"
    ? "composer.recordMode.voice"
    : "composer.recordMode.video");
}

export function getRecordingCopy(
  isVideoRecording: boolean,
  recordingSeconds: number,
  t: ComposerTranslateFn
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

export function getPrimaryButtonCopy(params: {
  isRecording: boolean;
  primaryAction: PrimaryComposerActionLike;
  currentRecordModeLabel: string;
  isGroupComposer: boolean;
  t: ComposerTranslateFn;
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

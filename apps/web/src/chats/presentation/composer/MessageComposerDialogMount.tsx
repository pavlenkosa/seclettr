import { lazy, Suspense } from "react";

import { InlineNotice } from "@/components/ui";
import type { UseMediaSendDialogResult } from "../../composer/useMediaSendDialog";
import type { MediaSendDialogProps } from "../MediaSendDialog";
import type { DialogState } from "./message-composer-view-model";
import styles from "../MessageComposer.module.css";

const MediaSendDialog = lazy(() =>
  import("../MediaSendDialog").then(({ MediaSendDialog: Component }) => ({
    default: Component,
  }))
);

type ComposerErrorMessageProps = Readonly<{ message: string | null }>;

type MountedMediaSendDialogProps = Readonly<{
  dialogState: DialogState;
  mediaSend: UseMediaSendDialogResult;
}>;

export function ComposerErrorMessage({ message }: ComposerErrorMessageProps) {
  return message ? (
    <InlineNotice tone="error" size="sm" className={styles.errorNotice} role="alert">
      {message}
    </InlineNotice>
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

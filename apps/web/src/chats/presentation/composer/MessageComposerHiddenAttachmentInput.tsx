import type { ChangeEvent } from "react";

import type { UseMessageComposerDraftResult } from "../../composer/useMessageComposerDraft";
import type { UseMediaSendDialogResult } from "../../composer/useMediaSendDialog";
import styles from "../MessageComposer.module.css";

type HiddenAttachmentInputProps = Readonly<{
  draft: UseMessageComposerDraftResult;
  mediaSend: UseMediaSendDialogResult;
}>;

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

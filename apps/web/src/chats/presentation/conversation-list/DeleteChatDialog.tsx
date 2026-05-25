import { useRef } from "react";
import { useAnimatedClose, useModalSurfaceA11y } from "@/lib/hooks";
import { ModalShell, PillButton } from "@/components/ui";
import styles from "./DeleteChatDialog.module.css";

interface DeleteChatDialogProps {
  readonly chatName: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

export function DeleteChatDialog({
  chatName,
  onConfirm,
  onCancel,
  t,
}: DeleteChatDialogProps) {
  const modalRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { isClosing, requestClose } = useAnimatedClose(onCancel);

  useModalSurfaceA11y({
    containerRef: modalRef,
    initialFocusRef: cancelRef,
    onClose: requestClose,
  });

  return (
    <ModalShell
      ref={modalRef}
      role="alertdialog"
      isClosing={isClosing}
      onClose={requestClose}
      ariaLabel={t("conversation.deleteChat")}
      closeAriaLabel={t("folders.cancel")}
      title={t("conversation.deleteChat")}
      surfaceClassName={styles.surface}
      footer={
        <div className={styles.actions}>
          <PillButton ref={cancelRef} tone="neutral" onClick={requestClose}>
            {t("folders.cancel")}
          </PillButton>
          <PillButton tone="danger" appearance="strong" onClick={onConfirm}>
            {t("conversation.deleteChatConfirm")}
          </PillButton>
        </div>
      }
    >
      <p className={styles.body}>
        {t("conversation.deleteChatWarning", { name: chatName })}
      </p>
    </ModalShell>
  );
}

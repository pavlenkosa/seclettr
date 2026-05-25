import { useCallback, useRef, useState } from "react";
import { MAX_FOLDER_NAME_LENGTH } from "@seclettr/protocol";
import { useAnimatedClose, useModalSurfaceA11y } from "@/lib/hooks";
import { InputField, ModalShell, PillButton } from "@/components/ui";
import styles from "./FolderNameDialog.module.css";

interface FolderNameDialogProps {
  readonly mode: "create" | "rename";
  readonly initialName?: string;
  readonly onConfirm: (name: string) => void;
  readonly onCancel: () => void;
  readonly t: (key: string) => string;
}

export function FolderNameDialog({
  mode,
  initialName = "",
  onConfirm,
  onCancel,
  t,
}: FolderNameDialogProps) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const { isClosing, requestClose } = useAnimatedClose(onCancel);

  useModalSurfaceA11y({
    containerRef: modalRef,
    initialFocusRef: inputRef,
    onClose: requestClose,
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (trimmed.length === 0) return;
      onConfirm(trimmed);
    },
    [name, onConfirm]
  );

  const title = mode === "create" ? t("folders.create") : t("folders.rename");

  return (
    <ModalShell
      ref={modalRef}
      isClosing={isClosing}
      onClose={requestClose}
      ariaLabel={title}
      closeAriaLabel={t("folders.cancel")}
      closeButtonRef={closeButtonRef}
      title={title}
      surfaceClassName={styles.surface}
      footer={
        <div className={styles.actions}>
          <PillButton tone="neutral" onClick={requestClose}>
            {t("folders.cancel")}
          </PillButton>
          <PillButton
            tone="accent"
            appearance="strong"
            type="submit"
            form="folder-name-form"
            disabled={name.trim().length === 0}
          >
            {mode === "create" ? t("folders.create") : t("folders.save")}
          </PillButton>
        </div>
      }
    >
      <form id="folder-name-form" className={styles.form} onSubmit={handleSubmit}>
        <InputField
          ref={inputRef}
          size="md"
          value={name}
          maxLength={MAX_FOLDER_NAME_LENGTH}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("folders.namePlaceholder")}
          wrapperClassName={styles.inputWrapper}
        />
      </form>
    </ModalShell>
  );
}

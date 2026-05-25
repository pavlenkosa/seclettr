import { useRef, type CSSProperties } from "react";
import { useI18n } from "@/i18n";
import { useAnimatedClose, useModalSurfaceA11y } from "@/lib/hooks";
import { ModalShell, SurfacePanel } from "@/components/ui";
import styles from "./ChatTypePickerModal.module.css";

interface Props {
  readonly userId: string;
  readonly username: string;
  readonly onClose: () => void;
  readonly onSelectE2ee: (userId: string, username: string) => void;
  readonly onSelectPlain: (userId: string, username: string) => void;
}

const E2eeSvg = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.35C16.5 22.15 20 17.25 20 12V6l-8-4Z"
      stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
    />
    <path
      d="M9 12l2 2 4-4"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
    />
  </svg>
);

const PlainSvg = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
      stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
    />
  </svg>
);

export function ChatTypePickerModal({ userId, username, onClose, onSelectE2ee, onSelectPlain }: Props) {
  const { t } = useI18n();
  const { isClosing, requestClose } = useAnimatedClose(onClose);
  const modalRef = useRef<HTMLElement>(null);

  useModalSurfaceA11y({
    containerRef: modalRef,
    onClose: requestClose,
  });

  return (
    <ModalShell
      ref={modalRef}
      isClosing={isClosing}
      onClose={requestClose}
      ariaLabel={t("newChat.chooseType.title")}
      closeAriaLabel={t("newChat.closeAria")}
      title={t("newChat.chooseType.title")}
      style={{
        "--modal-width": "400px",
        "--modal-max-height": "60dvh",
        "--modal-z-index": "var(--z-200)",
      } as CSSProperties}
    >
      <SurfacePanel as="div" className={styles.list} padding="none" radius="lg">
        <button
          className={styles.option}
          onClick={() => onSelectE2ee(userId, username)}
          type="button"
        >
          <span className={`${styles.iconWrap} ${styles.iconE2ee}`}>{E2eeSvg}</span>
          <span className={styles.text}>
            <span className={styles.title}>{t("newChat.chooseType.encrypted")}</span>
            <span className={styles.subtitle}>{t("newChat.chooseType.encryptedDesc")}</span>
          </span>
        </button>
        <span className={styles.divider} aria-hidden="true" />
        <button
          className={styles.option}
          onClick={() => onSelectPlain(userId, username)}
          type="button"
        >
          <span className={`${styles.iconWrap} ${styles.iconPlain}`}>{PlainSvg}</span>
          <span className={styles.text}>
            <span className={styles.title}>{t("newChat.chooseType.regular")}</span>
            <span className={styles.subtitle}>{t("newChat.chooseType.regularDesc")}</span>
          </span>
        </button>
      </SurfacePanel>
    </ModalShell>
  );
}

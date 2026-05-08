import {
  forwardRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type Ref,
} from "react";
import motionStyles from "@/components/ui/motion/Motion.module.css";
import styles from "./ModalShell.module.css";

export interface ModalShellProps {
  /** Closing animation flag used to delay unmount without losing focus state. */
  readonly isClosing: boolean;
  /** Requests dismissal from the overlay, close button, or keyboard handlers. */
  readonly onClose: () => void;
  /** Accessible dialog label used when the visible title is not sufficient. */
  readonly ariaLabel: string;
  /** Accessible label for the close button. */
  readonly closeAriaLabel: string;
  /** Primary visible title rendered in the modal header. */
  readonly title?: ReactNode;
  /** Optional slot rendered at the start of the header row. */
  readonly headerStart?: ReactNode;
  /** Optional slot rendered before the close button on the trailing side. */
  readonly headerExtra?: ReactNode;
  /** Modal body content. */
  readonly children: ReactNode;
  readonly role?: "dialog" | "alertdialog";
  readonly overlayClassName?: string;
  readonly surfaceClassName?: string;
  readonly headerClassName?: string;
  readonly bodyClassName?: string;
  readonly titleClassName?: string;
  readonly closeButtonClassName?: string;
  readonly footer?: ReactNode;
  readonly footerClassName?: string;
  readonly style?: CSSProperties;
  readonly closeButtonRef?: Ref<HTMLButtonElement>;
}

function ModalShellInner(
  {
    isClosing,
    onClose,
    ariaLabel,
    closeAriaLabel,
    title,
    headerStart,
    headerExtra,
    children,
    role = "dialog",
    overlayClassName = "",
    surfaceClassName = "",
    headerClassName = "",
    bodyClassName = "",
    titleClassName = "",
    closeButtonClassName = "",
    footer,
    footerClassName = "",
    style,
    closeButtonRef,
  }: ModalShellProps,
  ref: Ref<HTMLElement>
) {
  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  const handleOverlayKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onClose();
  };

  return (
    <div
      className={`${styles.overlay} ${isClosing ? motionStyles.fadeOut : motionStyles.fadeIn} ${overlayClassName}`.trim()}
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
      aria-hidden={isClosing ? "true" : undefined}
    >
      <section
        ref={ref}
        className={`${styles.surface} ${isClosing ? motionStyles.surfaceOut : motionStyles.surfaceIn} ${surfaceClassName}`.trim()}
        role={role}
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        style={style}
      >
        <header className={`${styles.header} ${headerClassName}`.trim()}>
          <div className={styles.headerMain}>
            {headerStart}
            {title ? <h2 className={`${styles.title} ${titleClassName}`.trim()}>{title}</h2> : null}
          </div>
          <div className={styles.headerMain}>
            {headerExtra}
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className={`${styles.closeButton} ${closeButtonClassName}`.trim()}
              aria-label={closeAriaLabel}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M3 3l10 10M13 3L3 13"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </header>

        <div className={`${styles.body} ${bodyClassName}`.trim()}>{children}</div>
        {footer ? <div className={`${styles.footer} ${footerClassName}`.trim()}>{footer}</div> : null}
      </section>
    </div>
  );
}

/**
 * Shared modal frame with overlay, header, close button, and body/footer slots.
 * It owns the generic dialog shell only and should not absorb domain-specific logic.
 */
export const ModalShell = forwardRef<HTMLElement, ModalShellProps>(ModalShellInner);

/**
 * ModalShell — shared modal or sheet frame with overlay, header, close button, and body/footer slots.
 *
 * Owns:
 *   - Rendering a backdrop overlay with fade animation and click-to-dismiss behavior.
 *   - Composing the dialog surface with header (title, headerStart, headerExtra, close button), body, and optional footer.
 *   - Keyboard Escape dismissal and `aria-modal` / role ARIA contract.
 *   - Closing animation flag (`isClosing`) for delayed unmount without losing focus state.
 *
 * Does not own runtime state, business logic, or domain-specific wiring.
 * Use when: framing standard overlays that can stack within the app modal system; do not use for fullscreen call surfaces with media-first or dock semantics.
 */
import {
  forwardRef,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useModalSurfaceA11y } from "@/lib/hooks";
import { IconClose } from "../icons";
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
  /** Optional id of an element inside the modal that describes its purpose (aria-describedby). */
  readonly ariaDescribedBy?: string;
}

function ModalShellInner(
  {
    isClosing,
    onClose,
    ariaLabel,
    ariaDescribedBy,
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
  const containerRef = useRef<HTMLElement | null>(null);
  const effectiveInitialFocus = closeButtonRef != null && typeof closeButtonRef !== "function"
    ? (closeButtonRef as RefObject<HTMLElement>)
    : undefined;

  useModalSurfaceA11y({
    containerRef,
    onClose,
    initialFocusRef: effectiveInitialFocus,
    isActive: !isClosing,
  });

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div
      className={`${styles.overlay} ${isClosing ? motionStyles.fadeOut : motionStyles.fadeIn} ${overlayClassName}`.trim()}
      onClick={handleOverlayClick}
      aria-hidden={isClosing ? "true" : undefined}
    >
      <section
        ref={(node) => {
          containerRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref != null) ((ref as unknown) as { current: HTMLElement | null }).current = node;
        }}
        className={`${styles.surface} ${isClosing ? motionStyles.surfaceOut : motionStyles.surfaceIn} ${surfaceClassName}`.trim()}
        role={role}
        aria-modal="true"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
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
              <IconClose strokeWidth={2} />
            </button>
          </div>
        </header>

        <div className={`${styles.body} ${bodyClassName}`.trim()}>{children}</div>
        {footer ? <div className={`${styles.footer} ${footerClassName}`.trim()}>{footer}</div> : null}
      </section>
    </div>,
    document.body
  );
}

/**
 * Shared modal or sheet frame with overlay, header, close button, and body/footer slots.
 * It owns the generic dialog a11y/close contract only and should not absorb domain-specific logic.
 * Choose it for standard framed overlays that can stack with the rest of the app modal system.
 * Do not treat it as a replacement for `CallPanelShell`; fullscreen call surfaces with media-first,
 * minimize/dock, or runtime-adjacent call semantics should stay on the call-specific shell.
 */
export const ModalShell = forwardRef<HTMLElement, ModalShellProps>(ModalShellInner);

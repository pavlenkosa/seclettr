import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ForwardedRef,
  type HTMLAttributes,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import motionStyles from "@/components/ui/motion/Motion.module.css";
import styles from "./FloatingDock.module.css";

// Tracks the number of mounted FloatingDock instances so the CSS clearance
// variable is removed only when the last dock unmounts.
let _activeDockCount = 0;

export interface FloatingDockProps extends Omit<HTMLAttributes<HTMLDialogElement>, "children" | "onDragStart" | "onDragEnd"> {
  /** Accessible label announced for the floating dock dialog surface. */
  readonly dialogAriaLabel: string;
  /** Accessible label used for the drag handle. */
  readonly dragAriaLabel: string;
  /** Summary node rendered in the middle flexible slot. */
  readonly summary: ReactNode;
  /** Trailing actions rendered on the right side of the dock. */
  readonly actions: ReactNode;
  /** Optional hidden media elements or auxiliary nodes rendered before the handle. */
  readonly auxiliary?: ReactNode;
  /** Marks the dock as being actively dragged. */
  readonly isDragging?: boolean;
  /** Applies exit animation while delayed-unmount surfaces finish closing. */
  readonly isClosing?: boolean;
  /** Pointer handlers for drag interactions. */
  readonly onDragStart: PointerEventHandler<HTMLButtonElement>;
  readonly onDragMove: PointerEventHandler<HTMLButtonElement>;
  readonly onDragEnd: PointerEventHandler<HTMLButtonElement>;
  readonly style?: CSSProperties;
}

function assignRef<TValue>(ref: ForwardedRef<TValue> | undefined, value: TValue | null) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  ref.current = value;
}

/**
 * Shared floating dock shell for minimized call surfaces.
 * It aligns drag handle, summary content, and trailing actions across direct
 * and group call UIs while keeping positioning adjustable via CSS variables.
 * Choose it for draggable minimized call surfaces only; do not generalize it into a generic floating action or modal shell.
 */
export const FloatingDock = forwardRef<HTMLDialogElement, FloatingDockProps>(function FloatingDock(
  {
    dialogAriaLabel,
    dragAriaLabel,
    summary,
    actions,
    auxiliary = null,
    isDragging = false,
    isClosing = false,
    onDragStart,
    onDragMove,
    onDragEnd,
    className = "",
    style,
    ...props
  },
  ref
) {
  const dockRef = useRef<HTMLDialogElement | null>(null);
  const handleDockRef = useCallback((node: HTMLDialogElement | null) => {
    dockRef.current = node;
    assignRef(ref, node);
  }, [ref]);

  // Signal to the chat layout that a dock is visible so it can clear space
  // at the bottom. Uses a ref-count so multiple concurrent docks are safe.
  useLayoutEffect(() => {
    _activeDockCount++;
    const updateClearance = () => {
      const dock = dockRef.current;
      if (!dock) return;
      const computed = globalThis.getComputedStyle(dock);
      const bottomPx = Number.parseFloat(computed.bottom);
      const clearancePx = Number.isFinite(bottomPx)
        ? Math.max(0, Math.round(dock.offsetHeight + bottomPx))
        : 0;
      document.documentElement.style.setProperty("--call-dock-clearance", `${clearancePx}px`);
    };

    let resizeObserver: ResizeObserver | null = null;
    if (dockRef.current) {
      updateClearance();
      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          updateClearance();
        });
        resizeObserver.observe(dockRef.current);
      }
      globalThis.addEventListener("resize", updateClearance);
    }

    return () => {
      resizeObserver?.disconnect();
      globalThis.removeEventListener("resize", updateClearance);
      _activeDockCount--;
      if (_activeDockCount === 0) {
        document.documentElement.style.removeProperty("--call-dock-clearance");
      }
    };
  }, []);

  return (
    <dialog
      {...props}
      ref={handleDockRef}
      open
      aria-label={dialogAriaLabel}
      tabIndex={-1}
      className={[
        styles.root,
        isDragging ? styles.dragging : "",
        isClosing ? motionStyles.fadeOut : motionStyles.fadeIn,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      {auxiliary}
      <button
        type="button"
        className={styles.dragHandle}
        aria-label={dragAriaLabel}
        title={dragAriaLabel}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <span className={styles.dragDots} aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </span>
      </button>
      <div className={styles.summary}>{summary}</div>
      <div className={styles.actions}>{actions}</div>
    </dialog>
  );
});

/**
 * HeaderBar — shared three-slot surface header for compact panel, dialog, and call-overlay headers.
 *
 * Owns:
 *   - Leading / center / trailing slot composition with balanced alignment.
 *   - Narrow-screen stacking mode for center content when the header gets tight.
 *
 * Does not own:
 *   - page-level layout
 *   - row semantics for list items
 *   - runtime-specific header logic
 *
 * Use when: a surface needs a stable header shell with explicit slot ownership.
 * Avoid when: the layout is a full page frame or an entity row rather than a compact header.
 */
import type { ElementType, HTMLAttributes, ReactNode } from "react";
import styles from "./HeaderBar.module.css";

export interface HeaderBarProps extends Readonly<HTMLAttributes<HTMLElement>> {
  /** Semantic element used for the header wrapper. */
  readonly as?: ElementType;
  /** Optional node rendered in the leading slot. */
  readonly leading?: ReactNode;
  /** Optional centered node rendered in the middle slot. */
  readonly center?: ReactNode;
  /** Optional trailing node rendered in the actions slot. */
  readonly trailing?: ReactNode;
  /** Stacks the center slot below leading and trailing content on narrow screens. */
  readonly stackCenterOnNarrow?: boolean;
}

/**
 * Shared three-slot header shell for call overlays and panel headers that need
 * balanced leading, centered, and trailing content.
 * Choose it for compact header composition with stable slot ownership; do not use it as a full page layout system or a replacement for EntityRow.
 */
export function HeaderBar({
  as: Component = "div",
  leading = null,
  center = null,
  trailing = null,
  stackCenterOnNarrow = false,
  className = "",
  ...props
}: Readonly<HeaderBarProps>) {
  return (
    <Component
      {...props}
      className={[
        styles.root,
        stackCenterOnNarrow ? styles.stackCenterOnNarrow : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={`${styles.slot} ${styles.leading}`}>{leading}</div>
      <div className={`${styles.slot} ${styles.center}`}>{center}</div>
      <div className={`${styles.slot} ${styles.trailing}`}>{trailing}</div>
    </Component>
  );
}

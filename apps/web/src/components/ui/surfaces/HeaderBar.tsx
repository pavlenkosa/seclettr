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

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import styles from "./StatusBadge.module.css";

export type StatusBadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";
type StatusBadgeSize = "sm" | "md" | "lg";

export interface StatusBadgeProps extends Readonly<HTMLAttributes<HTMLSpanElement>> {
  /** Visual tone used for the badge foreground, border, and surface. */
  readonly tone?: StatusBadgeTone;
  /** Compact size preset used across headers, notices, and toolbars. */
  readonly size?: StatusBadgeSize;
  /** Optional leading icon rendered before the label. */
  readonly icon?: ReactNode;
  /** Renders a small status dot when no custom icon is needed. */
  readonly dot?: boolean;
  /** Override icon size with a CSS unit or pixel number. */
  readonly iconSize?: number | string;
  readonly children: ReactNode;
}

/**
 * Shared inline status badge for security labels, call state pills, and small
 * meta chips. Keep semantic state in the parent and pass only the resolved tone.
 */
export function StatusBadge({
  tone = "neutral",
  size = "sm",
  icon,
  dot = false,
  iconSize,
  children,
  className = "",
  style,
  ...props
}: Readonly<StatusBadgeProps>) {
  const iconSizeValue = typeof iconSize === "number" ? `${iconSize}px` : iconSize;
  const mergedStyle = (
    iconSizeValue
      ? {
          ...style,
          "--status-badge-icon-size": iconSizeValue,
        }
      : style
  ) as CSSProperties | undefined;

  return (
    <span
      {...props}
      className={[
        styles.badge,
        styles[tone],
        styles[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={mergedStyle}
    >
      {icon ? <span className={styles.leading} aria-hidden="true">{icon}</span> : null}
      {!icon && dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      <span className={styles.content}>{children}</span>
    </span>
  );
}

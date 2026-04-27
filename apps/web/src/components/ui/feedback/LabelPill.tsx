import type { HTMLAttributes, ReactNode } from "react";
import styles from "./LabelPill.module.css";

type LabelPillTone = "default" | "overlay";
type LabelPillSize = "xs" | "sm" | "md";

export interface LabelPillProps extends Readonly<HTMLAttributes<HTMLSpanElement>> {
  /** Visual tone for neutral surfaces or dark media overlays. */
  readonly tone?: LabelPillTone;
  /** Size recipe used by compact media/status labels. */
  readonly size?: LabelPillSize;
  readonly children: ReactNode;
}

/**
 * Shared compact text pill for media labels, stage badges, and other small
 * non-interactive UI tags that do not need a full status or icon treatment.
 */
export function LabelPill({
  tone = "default",
  size = "sm",
  className = "",
  children,
  ...props
}: Readonly<LabelPillProps>) {
  return (
    <span
      {...props}
      className={[
        styles.root,
        styles[tone],
        styles[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

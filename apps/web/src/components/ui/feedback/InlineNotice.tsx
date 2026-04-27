import type { HTMLAttributes, ReactNode } from "react";
import styles from "./InlineNotice.module.css";

type InlineNoticeTone = "info" | "warning" | "error";
type InlineNoticeSize = "sm" | "md";

export interface InlineNoticeProps extends Readonly<HTMLAttributes<HTMLDivElement>> {
  /** Visual tone for neutral info, warning, or destructive inline notices. */
  readonly tone?: InlineNoticeTone;
  /** Compact or default spacing preset. */
  readonly size?: InlineNoticeSize;
  readonly children: ReactNode;
}

/**
 * Shared compact notice surface for inline hints, transport warnings, and
 * lightweight overlay messages that should stay on the same glass system.
 */
export function InlineNotice({
  tone = "info",
  size = "sm",
  className = "",
  children,
  ...props
}: Readonly<InlineNoticeProps>) {
  return (
    <div
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
    </div>
  );
}

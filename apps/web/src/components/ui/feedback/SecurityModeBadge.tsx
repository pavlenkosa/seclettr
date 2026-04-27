import type { HTMLAttributes, ReactNode } from "react";
import styles from "./SecurityModeBadge.module.css";

type SecurityModeBadgeTone = "frame" | "transport";

export interface SecurityModeBadgeProps extends Readonly<HTMLAttributes<HTMLSpanElement>> {
  /** Visual tone that maps to frame-level or transport-only media security. */
  readonly tone: SecurityModeBadgeTone;
  readonly children: ReactNode;
}

/**
 * Shared media-security mode badge used by call security panels and related
 * diagnostics where the encryption mode needs a consistent compact label.
 */
export function SecurityModeBadge({
  tone,
  className = "",
  children,
  ...props
}: Readonly<SecurityModeBadgeProps>) {
  return (
    <span
      {...props}
      className={[
        styles.badge,
        tone === "frame" ? styles.frame : styles.transport,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

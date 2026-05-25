/**
 * SecurityModeBadge — shared media-security mode badge for call security panels and encryption diagnostics.
 *
 * Owns:
 *   - Rendering a compact `<span>` badge with `frame` or `transport` tone-driven styling.
 *   - Providing a consistent label shape for call/media encryption mode indicators.
 *
 * Does not own runtime state, business logic, or domain-specific wiring.
 * Use when: displaying call or media encryption modes; prefer StatusBadge for broader product state that is not specifically about transport or frame protection.
 */
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
 * Choose it for call/media security modes only; prefer StatusBadge for broader product state that is not specifically about transport or frame protection.
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

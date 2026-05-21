/**
 * IconPill — shared icon-plus-label pill for compact contextual labels such as call mode, media type, and toolbar states.
 *
 * Owns:
 *   - Rendering an icon slot followed by a text label inside a pill-shaped `<span>`.
 *   - Size presets (`sm`/`md`) for compact and standard pill presentations.
 *
 * Does not own runtime state, business logic, or domain-specific wiring.
 * Use when: the icon meaning is part of the label; prefer LabelPill when the text tag stands on its own without icon semantics.
 */
import type { HTMLAttributes, ReactNode } from "react";
import styles from "./IconPill.module.css";

type IconPillSize = "sm" | "md";

export interface IconPillProps extends Readonly<HTMLAttributes<HTMLSpanElement>> {
  /** Leading icon rendered inside the pill. */
  readonly icon: ReactNode;
  /** Size recipe for compact or standard pill presentations. */
  readonly size?: IconPillSize;
  readonly children: ReactNode;
}

/**
 * Shared icon-plus-label pill for compact contextual labels such as call mode,
 * media type, and floating toolbar states.
 * Choose it when the icon meaning is part of the label; prefer LabelPill when the text tag stands on its own without icon semantics.
 */
export function IconPill({
  icon,
  size = "md",
  className = "",
  children,
  ...props
}: Readonly<IconPillProps>) {
  return (
    <span
      {...props}
      className={[
        styles.root,
        size === "sm" ? styles.sm : styles.md,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <span className={styles.label}>{children}</span>
    </span>
  );
}

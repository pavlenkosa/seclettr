/**
 * InlineNotice — shared compact notice surface for inline hints, transport warnings, and lightweight overlay messages.
 *
 * Owns:
 *   - Rendering a tinted `<div>` with tone (`info`/`warning`/`error`) and size (`sm`/`md`) presets.
 *   - Keeping the flat surface aligned with the broader UI system without absorbing domain logic.
 *
 * Does not own runtime state, business logic, or domain-specific wiring.
 * Use when: in-flow feedback is needed near the owning UI element; do not use as a page banner or replacement for modal/destructive confirmation flows.
 */
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
 * lightweight overlay messages that should stay on the same flat system.
 * Choose it for in-flow feedback near the owning UI; do not use it as a page banner or as a replacement for modal/destructive confirmation flows.
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

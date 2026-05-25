/**
 * LabelPill — shared compact text pill for media labels, stage badges, and non-interactive UI tags.
 *
 * Owns:
 *   - Rendering a pill-shaped `<span>` with tone (`default`/`overlay`) and size (`xs`/`sm`/`md`) presets.
 *   - Neutral surface for media labels and dark-overlay variants for content overlaid on video or images.
 *
 * Does not own runtime state, business logic, or domain-specific wiring.
 * Use when: a passive text tag is needed; prefer IconPill when the icon adds meaning, and prefer StatusBadge when the label communicates semantic product state.
 */
import type { HTMLAttributes, ReactNode } from "react";
import styles from "./LabelPill.module.css";

type LabelPillTone = "default" | "overlay" | "warning";
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
 * Choose it for passive text tags; prefer IconPill when the icon adds meaning, and prefer StatusBadge when the label communicates semantic product state.
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

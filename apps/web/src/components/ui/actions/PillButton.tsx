/**
 * PillButton — shared rounded action button for compact CTA patterns and secondary modal controls.
 *
 * Owns:
 *   - Rendering a `<button>` with tone (`neutral`/`accent`/`danger`), appearance (`soft`/`strong`), and size (`sm`/`md`) variants.
 *   - Optional leading and trailing icon slots flanking the label content.
 *   - Full-width expansion mode for list-level or footer CTAs.
 *
 * Does not own runtime state, business logic, or domain-specific wiring.
 * Use when: the action has visible text and a chip-like pill shape; prefer IconButton for icon-only affordances.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import styles from "./PillButton.module.css";

type PillButtonTone = "neutral" | "accent" | "danger";
type PillButtonAppearance = "soft" | "strong";
type PillButtonSize = "sm" | "md";

export interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Shared tone used for compact actions, chips, and secondary modal controls. */
  readonly tone?: PillButtonTone;
  /** Controls how strong the tint should be for the selected tone. */
  readonly appearance?: PillButtonAppearance;
  /** Size preset used across inline actions and footer buttons. */
  readonly size?: PillButtonSize;
  /** Optional leading icon or glyph rendered before the label. */
  readonly leading?: ReactNode;
  /** Optional trailing icon or glyph rendered after the label. */
  readonly trailing?: ReactNode;
  /** Expands the button to the full available width. */
  readonly fullWidth?: boolean;
}

/**
 * Shared rounded action button for compact CTA patterns. It keeps chip-like
 * buttons, small member actions, and secondary modal controls on one
 * interaction recipe while respecting the flat surface system.
 * Choose it for compact labeled actions; prefer IconButton for icon-only affordances, and do not document loading unless the primitive gets a real loading contract.
 */
export const PillButton = forwardRef<HTMLButtonElement, PillButtonProps>(function PillButton(
  {
    tone = "neutral",
    appearance = "soft",
    size = "sm",
    leading,
    trailing,
    fullWidth = false,
    className = "",
    type = "button",
    children,
    ...props
  },
  ref
) {
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={[
        styles.button,
        styles[tone],
        styles[appearance],
        styles[size],
        fullWidth ? styles.fullWidth : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {leading ? <span className={styles.leading} aria-hidden="true">{leading}</span> : null}
      <span className={styles.content}>{children}</span>
      {trailing ? <span className={styles.trailing} aria-hidden="true">{trailing}</span> : null}
    </button>
  );
});

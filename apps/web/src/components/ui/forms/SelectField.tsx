/**
 * SelectField — shared native select shell for modal forms and compact settings controls.
 *
 * Owns:
 *   - Rendering a styled `<label>` wrapper around a native `<select>` with a custom SVG chevron indicator.
 *   - Optional leading icon slot and size presets (`md`/`pill`) aligned with InputField styling.
 *
 * Does not own runtime state, business logic, or domain-specific wiring.
 * Use when: the option set is bounded and native select semantics are sufficient; prefer Listbox when a custom popup interaction is required.
 */
import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";
import styles from "./SelectField.module.css";

type SelectFieldSize = "md" | "pill";

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  /** Shared size preset for modal and toolbar select controls. */
  readonly size?: SelectFieldSize;
  /** Optional leading visual rendered before the select value. */
  readonly leading?: ReactNode;
  /** Optional className for the outer select shell. */
  readonly wrapperClassName?: string;
}

/**
 * Shared native select shell for modal forms and compact settings controls.
 * It keeps borders, flat fills, and caret treatment aligned with InputField.
 * Choose it first for simple bounded option sets with native semantics; prefer Listbox only when the product needs a custom popup interaction.
 */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  {
    size = "md",
    leading,
    wrapperClassName = "",
    className = "",
    children,
    ...props
  },
  ref
) {
  return (
    <label className={[styles.root, styles[size], wrapperClassName].filter(Boolean).join(" ")}>
      {leading ? <span className={styles.leading} aria-hidden="true">{leading}</span> : null}
      <select
        {...props}
        ref={ref}
        className={[styles.select, className].filter(Boolean).join(" ")}
      >
        {children}
      </select>
      <span className={styles.chevron} aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="m3.5 5 3.5 4 3.5-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </label>
  );
});

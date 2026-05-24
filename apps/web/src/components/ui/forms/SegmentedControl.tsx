/**
 * SegmentedControl — shared compact chooser for short mutually exclusive options that stay visible at once.
 *
 * Owns:
 *   - Rendering a domain-agnostic segmented button group with active, grouped, and compact variants.
 *   - Stable accessibility contract through a labeled fieldset and pressed-state buttons.
 *
 * Does not own:
 *   - option fetching or business rules
 *   - long-list selection UX
 *   - form-row layout around the control
 *
 * Use when: the user chooses among a small fixed set of options inline.
 * Avoid when: the option set is long enough that SelectField or Listbox is the more honest primitive.
 */
import type { ReactNode } from "react";
import styles from "./SegmentedControl.module.css";

export interface SegmentedControlOption<T extends string> {
  /** Stable option value returned through `onChange`. */
  readonly value: T;
  /** Visible label rendered inside the segment button. */
  readonly label: ReactNode;
  readonly ariaLabel?: string;
  readonly title?: string;
  readonly disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  /** Currently selected control value. */
  readonly value: T;
  /** Available options rendered by the control. */
  readonly options: SegmentedControlOption<T>[];
  /** Called when the user selects a different option. */
  readonly onChange: (value: T) => void;
  /** Group label announced by screen readers. */
  readonly ariaLabel: string;
  readonly className?: string;
  /** Enables the compact grouped look with a continuous capsule shell. */
  readonly grouped?: boolean;
  /** Further reduces button sizing for dense toolbars or tight settings rows. */
  readonly compact?: boolean;
}

/**
 * Shared segmented switch for settings panels and compact toolbar choices.
 * It stays domain-agnostic and only renders the interaction pattern.
 * Choose it for short mutually exclusive options visible at once; do not use it for long lists or cases better served by SelectField/Listbox.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  grouped = false,
  compact = false,
}: SegmentedControlProps<T>) {
  return (
    <fieldset
      className={`${styles.root} ${grouped ? styles.grouped : ""} ${compact ? styles.compact : ""} ${className}`.trim()}
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`${styles.button} ${option.value === value ? styles.active : ""}`.trim()}
          aria-label={option.ariaLabel}
          aria-pressed={option.value === value}
          title={option.title}
          disabled={option.disabled}
        >
          {option.label}
        </button>
      ))}
    </fieldset>
  );
}

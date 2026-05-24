/**
 * FieldSection — shared labeled field wrapper for settings rows, modal forms, and inline control groups.
 *
 * Owns:
 *   - Rendering a consistent label + control + helper-copy stack around child controls.
 *   - Primary and secondary description spacing below the child control.
 *
 * Does not own:
 *   - input/select interaction logic
 *   - row/grid layout between sibling settings controls
 *   - domain-specific validation or state wiring
 *
 * Use when: a control needs a stable label and helper-copy contract.
 * Avoid when: you only need raw spacing without semantic label/description ownership.
 */
import type { HTMLAttributes, ReactNode } from "react";
import styles from "./FieldSection.module.css";

export interface FieldSectionProps extends Readonly<HTMLAttributes<HTMLDivElement>> {
  /** Visible field label or section caption rendered above the control. */
  readonly label: ReactNode;
  /** Optional supporting copy rendered under the control content. */
  readonly description?: ReactNode;
  /** Optional secondary supporting copy rendered below the primary description. */
  readonly secondaryDescription?: ReactNode;
  /** Optional class applied to the label element. */
  readonly labelClassName?: string;
  /** Optional class applied to the description wrapper. */
  readonly descriptionClassName?: string;
  readonly children: ReactNode;
}

/**
 * Shared field section wrapper for modal forms and settings panels.
 * It keeps label hierarchy and supporting copy spacing consistent around controls.
 * Choose it as the default structured wrapper for labeled form rows; do not replace the inner control with layout-only wrappers that hide label or helper ownership.
 */
export function FieldSection({
  label,
  description,
  secondaryDescription,
  labelClassName = "",
  descriptionClassName = "",
  className = "",
  children,
  ...props
}: Readonly<FieldSectionProps>) {
  return (
    <div {...props} className={[styles.root, className].filter(Boolean).join(" ")}>
      <p className={[styles.label, labelClassName].filter(Boolean).join(" ")}>{label}</p>
      {children}
      {description || secondaryDescription ? (
        <div className={[styles.description, descriptionClassName].filter(Boolean).join(" ")}>
          {description ? <p className={styles.descriptionPrimary}>{description}</p> : null}
          {secondaryDescription ? <p className={styles.descriptionSecondary}>{secondaryDescription}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import styles from "./InputField.module.css";

type InputFieldSize = "md" | "lg" | "pill";

export interface InputFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Optional leading icon or glyph rendered inside the field shell. */
  readonly leading?: ReactNode;
  /** Shared size preset for modal fields, search bars, and compact toolbar inputs. */
  readonly size?: InputFieldSize;
  /** Optional className for the outer field shell. */
  readonly wrapperClassName?: string;
}

/**
 * Shared single-line input shell for search/name fields. It keeps focus ring,
 * glass-aware fill, radius, and icon spacing consistent across the UI kit.
 */
export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(function InputField(
  {
    leading,
    size = "md",
    className = "",
    wrapperClassName = "",
    type = "text",
    ...props
  },
  ref
) {
  return (
    <label className={[styles.root, styles[size], wrapperClassName].filter(Boolean).join(" ")}>
      {leading ? <span className={styles.leading} aria-hidden="true">{leading}</span> : null}
      <input
        {...props}
        ref={ref}
        type={type}
        className={[styles.input, className].filter(Boolean).join(" ")}
      />
    </label>
  );
});

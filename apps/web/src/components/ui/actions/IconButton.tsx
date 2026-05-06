import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from "react";
import styles from "./IconButton.module.css";

type IconButtonTone = "default" | "danger" | "success";
type IconButtonVariant = "default" | "ghost";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Square button size in pixels or any supported CSS unit. */
  readonly size?: number | string;
  /** Marks the button as the active state inside a toolbar or control set. */
  readonly active?: boolean;
  /** Visual tone used for destructive or success-oriented icon actions. */
  readonly tone?: IconButtonTone;
  /** Surface recipe used for neutral solid or ghost circular buttons. */
  readonly variant?: IconButtonVariant;
}

/**
 * Shared circular icon-only button for toolbars, headers, and floating controls.
 * Visual variants are controlled through CSS variables plus the tone and active props.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    size,
    active = false,
    tone = "default",
    variant = "default",
    className = "",
    style,
    type = "button",
    ...props
  },
  ref
) {
  const sizeValue = typeof size === "number" ? `${size}px` : size;
  const mergedStyle = (
    sizeValue
      ? {
          ...style,
          "--icon-button-size": sizeValue,
        }
      : style
  ) as CSSProperties | undefined;

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={[
        styles.button,
        variant === "ghost" ? styles.ghost : "",
        active ? styles.active : "",
        tone === "danger" ? styles.danger : "",
        tone === "success" ? styles.success : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={mergedStyle}
    />
  );
});

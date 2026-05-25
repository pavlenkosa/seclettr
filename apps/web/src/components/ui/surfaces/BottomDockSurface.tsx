/**
 * BottomDockSurface — shared mobile bottom-dock shell used by chat and other compact mobile surfaces.
 *
 * Owns:
 *   - Rendering a polymorphic bottom-anchored container (`div` or `nav`) with overlay or inline placement modes.
 *   - Applying enter/exit fade animations and flat dock spacing while feature modules supply only the dock content.
 *
 * Does not own runtime state, business logic, or domain-specific wiring.
 * Use when: a bottom-aligned mobile shell is needed in inline or overlay placement; prefer FloatingDock for draggable minimized call surfaces.
 */
import type { HTMLAttributes, ReactNode } from "react";
import motionStyles from "@/components/ui/motion/Motion.module.css";
import styles from "./BottomDockSurface.module.css";

type BottomDockSurfaceTag = "div" | "nav";

/**
 * Shared mobile bottom-dock shell used by chat and other compact mobile surfaces.
 * It owns the flat dock spacing and placement modes while feature modules provide
 * only the dock content.
 * Choose it for bottom-aligned mobile shells in inline or overlay placement; prefer FloatingDock for draggable minimized call surfaces.
 */
export interface BottomDockSurfaceProps extends Readonly<Omit<HTMLAttributes<HTMLElement>, "children">> {
  readonly as?: BottomDockSurfaceTag;
  readonly placement?: "overlay" | "inline";
  readonly isClosing?: boolean;
  readonly children: ReactNode;
}

export function BottomDockSurface({
  as = "div",
  placement = "overlay",
  isClosing = false,
  className = "",
  children,
  ...props
}: Readonly<BottomDockSurfaceProps>) {
  const Component = as;

  return (
    <Component
      {...(props as HTMLAttributes<HTMLElement>)}
      className={[
        styles.root,
        placement === "inline" ? styles.inline : "",
        isClosing ? motionStyles.fadeOut : motionStyles.fadeIn,
        className,
      ].filter(Boolean).join(" ")}
    >
      {children}
    </Component>
  );
}

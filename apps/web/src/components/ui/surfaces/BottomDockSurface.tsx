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

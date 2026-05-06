import type { HTMLAttributes, ReactNode } from "react";
import styles from "./BottomDockSurface.module.css";

type BottomDockSurfaceTag = "div" | "nav";

/**
 * Shared mobile bottom-dock shell used by chat and other compact mobile surfaces.
 * It owns the flat dock spacing and placement modes while feature modules provide
 * only the dock content.
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
        isClosing ? styles.rootClosing : "",
        className,
      ].filter(Boolean).join(" ")}
    >
      {children}
    </Component>
  );
}

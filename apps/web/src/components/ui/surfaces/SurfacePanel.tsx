import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";
import styles from "./SurfacePanel.module.css";

type SurfacePanelTone = "default" | "strong" | "accent";
type SurfacePanelGlass = "none" | "soft" | "medium" | "strong";
type SurfacePanelPadding = "none" | "sm" | "md" | "lg";
type SurfacePanelRadius = "md" | "lg" | "xl" | "pill";

export interface SurfacePanelProps extends Readonly<HTMLAttributes<HTMLElement>> {
  /** Semantic element used for the surface wrapper. */
  readonly as?: ElementType;
  /** Surface tint recipe for neutral, stronger, or accent-tinted panels. */
  readonly tone?: SurfacePanelTone;
  /** Blur preset bound to global glass settings. */
  readonly glass?: SurfacePanelGlass;
  /** Internal spacing preset for common panel layouts. */
  readonly padding?: SurfacePanelPadding;
  /** Radius preset used by sheets, cards, and pills. */
  readonly radius?: SurfacePanelRadius;
  readonly children: ReactNode;
  readonly style?: CSSProperties;
}

function toVariantKey(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/**
 * Shared panel surface for glass/elevated UI blocks. It centralizes border,
 * blur, tint, and radius decisions so chat, calls, and settings
 * stay on the same visual system and respect the global glass toggle.
 */
export function SurfacePanel({
  as: Component = "div",
  tone = "default",
  glass = "medium",
  padding = "md",
  radius = "lg",
  className = "",
  children,
  ...props
}: Readonly<SurfacePanelProps>) {
  return (
    <Component
      {...props}
      className={[
        styles.root,
        styles[tone],
        styles[`glass${toVariantKey(glass)}`],
        styles[`padding${toVariantKey(padding)}`],
        styles[`radius${toVariantKey(radius)}`],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Component>
  );
}

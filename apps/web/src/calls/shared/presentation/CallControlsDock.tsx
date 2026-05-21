/**
 * CallControlsDock — shared bottom controls surface for call panels.
 *
 * Owns:
 *   - Pill-shaped SurfacePanel shell with strong tone
 *   - CSS className forwarding for caller positioning
 *
 * Does not own the controls inside it, call state, or call lifecycle.
 * Consumed by both direct and group call panels to keep the controls dock visually consistent.
 */
import { type ReactNode } from "react";
import { SurfacePanel } from "@/components/ui";
import styles from "./CallControlsDock.module.css";

interface CallControlsDockProps {
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Shared call controls surface. It keeps the bottom controls dock visually
 * consistent while feature-specific controls remain inside each call module.
 */
export function CallControlsDock({ children, className = "" }: CallControlsDockProps) {
  return (
    <SurfacePanel
      tone="strong"
      padding="none"
      radius="pill"
      className={`${styles.root} ${className}`.trim()}
    >
      {children}
    </SurfacePanel>
  );
}

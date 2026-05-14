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

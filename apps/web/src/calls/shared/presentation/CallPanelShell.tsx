import { type ReactNode } from "react";
import motionStyles from "@/components/ui/motion/Motion.module.css";
import styles from "./CallPanelShell.module.css";

interface CallPanelShellProps {
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly backdropClassName?: string;
  readonly panelClassName?: string;
}

/**
 * Shared fullscreen call frame for direct, group, and room call surfaces.
 * Feature panels own their content; this component owns the modal shell.
 */
export function CallPanelShell({
  ariaLabel,
  children,
  backdropClassName = "",
  panelClassName = "",
}: CallPanelShellProps) {
  return (
    <dialog
      open
      className={`${styles.backdrop} ${motionStyles.fadeIn} ${backdropClassName}`.trim()}
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div className={`${styles.panel} ${motionStyles.surfaceIn} ${panelClassName}`.trim()}>
        {children}
      </div>
    </dialog>
  );
}

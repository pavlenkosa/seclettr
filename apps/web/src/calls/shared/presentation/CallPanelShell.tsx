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
 * Shared fullscreen call frame for group and room call surfaces, plus other call-owned fullscreen shells.
 * Feature panels own their content; this component only owns the call-specific fullscreen backdrop/panel shell.
 * Choose it when the surface is a media-first call container with call runtime semantics such as sticky controls,
 * stage/media layout, or minimized/dock adjacency.
 * Do not use it as a general modal replacement; standard dialogs and sheets should stay on `ModalShell`.
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

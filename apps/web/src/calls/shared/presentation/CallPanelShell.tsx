/**
 * CallPanelShell — fullscreen backdrop and panel shell for call surfaces.
 *
 * Owns:
 *   - `<dialog open>` backdrop with fade-in entry animation
 *   - Inner panel wrapper with surface-in entry animation
 *   - `aria-modal` and `aria-label` accessibility attributes
 *   - CSS className forwarding for backdrop and panel customisation
 *
 * Does not own call content, controls, media layout, or call lifecycle.
 * Consumed by both direct and group call panels as the outermost fullscreen frame.
 * Not a general-purpose modal; standard dialogs and sheets should use `ModalShell`.
 */
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

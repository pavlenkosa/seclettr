import type { RefObject } from "react";
import { useCallDialogFocusTrap } from "@/calls/shared/presentation/useCallDialogFocusTrap";
import type { DirectCallSurface } from "@/calls/direct/model/direct-call-types";

interface UseDirectCallSurfaceFocusTrapParams {
  surface: DirectCallSurface;
  incomingOverlayRef: RefObject<HTMLDivElement>;
  activeOverlayRef: RefObject<HTMLDialogElement>;
  minimizedDockRef: RefObject<HTMLDialogElement>;
  incomingAcceptButtonRef: RefObject<HTMLButtonElement>;
  activeHangupButtonRef: RefObject<HTMLButtonElement>;
  incomingMinimizedAcceptButtonRef: RefObject<HTMLButtonElement>;
  incomingMinimizedSummaryRef: RefObject<HTMLButtonElement>;
  activeMinimizedSummaryRef: RefObject<HTMLButtonElement>;
  onExpandMinimized: () => void;
  onHangup: () => void;
  onReject: () => void;
  isActiveStageViewerOpen?: boolean;
}

export function useDirectCallSurfaceFocusTrap({
  surface,
  incomingOverlayRef,
  activeOverlayRef,
  minimizedDockRef,
  incomingAcceptButtonRef,
  activeHangupButtonRef,
  incomingMinimizedAcceptButtonRef,
  incomingMinimizedSummaryRef,
  activeMinimizedSummaryRef,
  onExpandMinimized,
  onHangup,
  onReject,
  isActiveStageViewerOpen = false,
}: UseDirectCallSurfaceFocusTrapParams) {
  const incomingMinimizedInitialFocusRef: RefObject<HTMLElement | null> = {
    get current() {
      return incomingMinimizedAcceptButtonRef.current ?? incomingMinimizedSummaryRef.current;
    },
  };

  useCallDialogFocusTrap({
    isOpen: surface === "incoming-fullscreen",
    containerRef: incomingOverlayRef,
    initialFocusRef: incomingAcceptButtonRef,
    onClose: onReject,
    closeOnEscape: true,
    trapTab: true,
  });

  useCallDialogFocusTrap({
    isOpen: surface === "active-fullscreen" && !isActiveStageViewerOpen,
    containerRef: activeOverlayRef,
    initialFocusRef: activeHangupButtonRef,
    onClose: onHangup,
    closeOnEscape: true,
    trapTab: true,
  });

  useCallDialogFocusTrap({
    isOpen: surface === "incoming-minimized",
    containerRef: minimizedDockRef,
    initialFocusRef: incomingMinimizedInitialFocusRef,
    onClose: onReject,
    closeOnEscape: true,
    trapTab: true,
  });

  useCallDialogFocusTrap({
    isOpen: surface === "active-minimized",
    containerRef: minimizedDockRef,
    initialFocusRef: activeMinimizedSummaryRef,
    onClose: onExpandMinimized,
    closeOnEscape: true,
    trapTab: false,
  });
}

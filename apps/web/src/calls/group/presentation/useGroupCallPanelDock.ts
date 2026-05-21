/**
 * useGroupCallPanelDock — draggable minimized dock state and gesture handlers.
 *
 * Owns:
 *   - minimizedDockPosition — current (x, y) position of the minimized call bubble
 *   - isDraggingMinimizedDock — true while a pointer drag is in progress
 *   - minimizedDockRef — ref to the <dialog> element used as the dock
 *   - dockInlineStyle — CSS inline style with transform for the current position
 *   - resetMinimizedDock — resets position to null (dock returns to default position)
 *   - startMinimizedDockDrag — pointer-down handler that begins a drag sequence
 *   - Pointer move/up handlers wired to the document during drag
 *   - clampGroupCallMinimizedDockPosition integration for viewport boundary enforcement
 *
 * Does not own the minimized state toggle (see useGroupCallPanelUiState) or the
 * actual dock rendering (see GroupCallDock component).
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { clampGroupCallMinimizedDockPosition } from "@/calls/group/runtime/runtime-utils";
import type { MinimizedDockPosition } from "@/calls/group/model/group-call-types";

interface DragState {
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

interface UseGroupCallPanelDockOptions {
  isMinimized: boolean;
}

interface UseGroupCallPanelDockResult {
  minimizedDockPosition: MinimizedDockPosition | null;
  isDraggingMinimizedDock: boolean;
  minimizedDockRef: MutableRefObject<HTMLDialogElement | null>;
  dockInlineStyle: CSSProperties | undefined;
  resetMinimizedDock: () => void;
  startMinimizedDockDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  moveMinimizedDock: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  stopMinimizedDockDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

function applyMinimizedDockStyle(dock: HTMLElement | null, position: MinimizedDockPosition | null) {
  if (!dock) return;
  if (!position) {
    dock.style.left = "";
    dock.style.top = "";
    return;
  }
  dock.style.left = `${position.x}px`;
  dock.style.top = `${position.y}px`;
}

export function useGroupCallPanelDock({
  isMinimized,
}: UseGroupCallPanelDockOptions): UseGroupCallPanelDockResult {
  const [minimizedDockPosition, setMinimizedDockPosition] = useState<MinimizedDockPosition | null>(null);
  const [isDraggingMinimizedDock, setIsDraggingMinimizedDock] = useState(false);
  const minimizedDockRef = useRef<HTMLDialogElement | null>(null);
  const minimizedDockDragRef = useRef<DragState | null>(null);
  const minimizedDockPositionRef = useRef<MinimizedDockPosition | null>(null);

  useEffect(() => {
    if (!isMinimized || !minimizedDockPosition) return;

    const handleResize = () => {
      const dock = minimizedDockRef.current;
      if (!dock) return;

      setMinimizedDockPosition((current) => {
        if (!current) return current;
        const nextPosition = clampGroupCallMinimizedDockPosition(current, dock.offsetWidth, dock.offsetHeight);
        minimizedDockPositionRef.current = nextPosition;
        applyMinimizedDockStyle(dock, nextPosition);
        return nextPosition;
      });
    };

    globalThis.addEventListener("resize", handleResize);
    return () => {
      globalThis.removeEventListener("resize", handleResize);
    };
  }, [isMinimized, minimizedDockPosition]);

  const resetMinimizedDock = useCallback(() => {
    minimizedDockDragRef.current = null;
    minimizedDockPositionRef.current = null;
    setIsDraggingMinimizedDock(false);
    setMinimizedDockPosition(null);
    applyMinimizedDockStyle(minimizedDockRef.current, null);
  }, []);

  const startMinimizedDockDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const dock = minimizedDockRef.current;
    if (!dock) return;

    const rect = dock.getBoundingClientRect();
    const currentPosition = clampGroupCallMinimizedDockPosition(
      { x: rect.left, y: rect.top },
      rect.width,
      rect.height
    );
    minimizedDockPositionRef.current = currentPosition;
    setMinimizedDockPosition(currentPosition);
    setIsDraggingMinimizedDock(true);
    minimizedDockDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - currentPosition.x,
      offsetY: event.clientY - currentPosition.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, []);

  const moveMinimizedDock = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = minimizedDockDragRef.current;
    const dock = minimizedDockRef.current;
    if (dragState?.pointerId !== event.pointerId || !dock) return;

    const nextPosition = clampGroupCallMinimizedDockPosition(
      {
        x: event.clientX - dragState.offsetX,
        y: event.clientY - dragState.offsetY,
      },
      dock.offsetWidth,
      dock.offsetHeight
    );
    minimizedDockPositionRef.current = nextPosition;
    applyMinimizedDockStyle(dock, nextPosition);
  }, []);

  const stopMinimizedDockDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = minimizedDockDragRef.current;
    if (dragState?.pointerId !== event.pointerId) return;

    minimizedDockDragRef.current = null;
    setMinimizedDockPosition(minimizedDockPositionRef.current);
    setIsDraggingMinimizedDock(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const dockInlineStyle = useMemo<CSSProperties | undefined>(() => {
    if (!minimizedDockPosition) return undefined;
    return {
      left: `${minimizedDockPosition.x}px`,
      top: `${minimizedDockPosition.y}px`,
    };
  }, [minimizedDockPosition]);

  return {
    minimizedDockPosition,
    isDraggingMinimizedDock,
    minimizedDockRef,
    dockInlineStyle,
    resetMinimizedDock,
    startMinimizedDockDrag,
    moveMinimizedDock,
    stopMinimizedDockDrag,
  };
}

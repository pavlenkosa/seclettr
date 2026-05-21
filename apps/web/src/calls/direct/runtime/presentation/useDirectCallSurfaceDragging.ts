import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  clampFloatingPreviewPosition,
  clampFloatingPreviewWidth,
  clampMinimizedDockPosition,
} from "@/calls/direct/model/direct-call-ui-utils";

interface Point {
  x: number;
  y: number;
}

interface DragState {
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

interface ResizeState {
  pointerId: number;
  startX: number;
  startWidth: number;
}

interface UseDirectCallSurfaceDraggingParams {
  isMinimized: boolean;
  minimizedDockRef: RefObject<HTMLDialogElement>;
  localPreviewShellRef: RefObject<HTMLDivElement>;
  localScreenPreviewShellRef: RefObject<HTMLDivElement>;
}

function applyMinimizedDockStyle(dock: HTMLElement | null, position: Point | null) {
  if (!dock) return;
  if (!position) {
    dock.style.left = "";
    dock.style.top = "";
    dock.style.bottom = "";
    dock.style.transform = "";
    return;
  }
  dock.style.left = `${position.x}px`;
  dock.style.top = `${position.y}px`;
  dock.style.bottom = "auto";
  dock.style.transform = "none";
}

function applyFloatingPreviewStyle(
  preview: HTMLElement | null,
  position: Point | null,
  width?: number | null
) {
  if (!preview) return;
  if (position) {
    preview.style.left = `${position.x}px`;
    preview.style.top = `${position.y}px`;
    preview.style.right = "auto";
    preview.style.bottom = "auto";
  } else {
    preview.style.left = "";
    preview.style.top = "";
    preview.style.right = "";
    preview.style.bottom = "";
  }
  preview.style.width = width == null ? "" : `${width}px`;
}

export function useDirectCallSurfaceDragging({
  isMinimized,
  minimizedDockRef,
  localPreviewShellRef,
  localScreenPreviewShellRef,
}: UseDirectCallSurfaceDraggingParams) {
  const [minimizedDockPosition, setMinimizedDockPosition] = useState<Point | null>(null);
  const [isDraggingMinimizedDock, setIsDraggingMinimizedDock] = useState(false);
  const [localPreviewPosition, setLocalPreviewPosition] = useState<Point | null>(null);
  const [isDraggingLocalPreview, setIsDraggingLocalPreview] = useState(false);
  const [localPreviewWidth, setLocalPreviewWidth] = useState<number | null>(null);
  const [isResizingLocalPreview, setIsResizingLocalPreview] = useState(false);
  const [localScreenPreviewPosition, setLocalScreenPreviewPosition] = useState<Point | null>(null);
  const [isDraggingLocalScreenPreview, setIsDraggingLocalScreenPreview] = useState(false);

  const minimizedDockDragRef = useRef<DragState | null>(null);
  const minimizedDockPositionRef = useRef<Point | null>(null);
  const localPreviewDragRef = useRef<DragState | null>(null);
  const localPreviewResizeRef = useRef<ResizeState | null>(null);
  const localPreviewPositionRef = useRef<Point | null>(null);
  const localPreviewWidthRef = useRef<number | null>(null);
  const localScreenPreviewDragRef = useRef<DragState | null>(null);
  const localScreenPreviewPositionRef = useRef<Point | null>(null);

  const resetMinimizedDockState = useCallback(() => {
    setIsDraggingMinimizedDock(false);
    setMinimizedDockPosition(null);
    minimizedDockDragRef.current = null;
    minimizedDockPositionRef.current = null;
    applyMinimizedDockStyle(minimizedDockRef.current, null);
  }, [minimizedDockRef]);

  const resetLocalPreviewState = useCallback(() => {
    setLocalPreviewPosition(null);
    setLocalPreviewWidth(null);
    setIsDraggingLocalPreview(false);
    setIsResizingLocalPreview(false);
    localPreviewDragRef.current = null;
    localPreviewResizeRef.current = null;
    localPreviewPositionRef.current = null;
    localPreviewWidthRef.current = null;
    applyFloatingPreviewStyle(localPreviewShellRef.current, null, null);
  }, [localPreviewShellRef]);

  const resetLocalScreenPreviewState = useCallback(() => {
    setLocalScreenPreviewPosition(null);
    setIsDraggingLocalScreenPreview(false);
    localScreenPreviewDragRef.current = null;
    localScreenPreviewPositionRef.current = null;
    applyFloatingPreviewStyle(localScreenPreviewShellRef.current, null, null);
  }, [localScreenPreviewShellRef]);

  const startMinimizedDockDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const dock = minimizedDockRef.current;
    if (!dock) return;

    const rect = dock.getBoundingClientRect();
    const currentPosition = clampMinimizedDockPosition(
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
  }, [minimizedDockRef]);

  const moveMinimizedDock = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const dragState = minimizedDockDragRef.current;
    const dock = minimizedDockRef.current;
    if (dragState?.pointerId !== event.pointerId || !dock) return;

    const nextPosition = clampMinimizedDockPosition(
      {
        x: event.clientX - dragState.offsetX,
        y: event.clientY - dragState.offsetY,
      },
      dock.offsetWidth,
      dock.offsetHeight
    );
    minimizedDockPositionRef.current = nextPosition;
    applyMinimizedDockStyle(dock, nextPosition);
  }, [minimizedDockRef]);

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

  const startLocalPreviewDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const preview = localPreviewShellRef.current;
    if (!preview) return;

    const rect = preview.getBoundingClientRect();
    const currentPosition = clampFloatingPreviewPosition(
      localPreviewPositionRef.current ?? localPreviewPosition ?? { x: rect.left, y: rect.top },
      rect.width,
      rect.height
    );
    localPreviewPositionRef.current = currentPosition;
    setLocalPreviewPosition(currentPosition);
    setIsDraggingLocalPreview(true);
    localPreviewDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - currentPosition.x,
      offsetY: event.clientY - currentPosition.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [localPreviewPosition, localPreviewShellRef]);

  const moveLocalPreview = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = localPreviewDragRef.current;
    const preview = localPreviewShellRef.current;
    if (dragState?.pointerId !== event.pointerId || !preview) return;

    const nextPosition = clampFloatingPreviewPosition(
      {
        x: event.clientX - dragState.offsetX,
        y: event.clientY - dragState.offsetY,
      },
      preview.offsetWidth,
      preview.offsetHeight
    );
    localPreviewPositionRef.current = nextPosition;
    applyFloatingPreviewStyle(preview, nextPosition, localPreviewWidthRef.current);
  }, [localPreviewShellRef]);

  const stopLocalPreviewDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = localPreviewDragRef.current;
    if (dragState?.pointerId !== event.pointerId) return;
    localPreviewDragRef.current = null;
    setLocalPreviewPosition(localPreviewPositionRef.current);
    setIsDraggingLocalPreview(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const startLocalPreviewResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const preview = localPreviewShellRef.current;
    if (!preview) return;

    const rect = preview.getBoundingClientRect();
    const currentWidth = clampFloatingPreviewWidth(localPreviewWidthRef.current ?? localPreviewWidth ?? rect.width);
    localPreviewWidthRef.current = currentWidth;
    setLocalPreviewWidth(currentWidth);
    setIsResizingLocalPreview(true);
    localPreviewResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: currentWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [localPreviewShellRef, localPreviewWidth]);

  const moveLocalPreviewResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const resizeState = localPreviewResizeRef.current;
    const preview = localPreviewShellRef.current;
    if (resizeState?.pointerId !== event.pointerId || !preview) return;

    const nextWidth = clampFloatingPreviewWidth(
      resizeState.startWidth + (event.clientX - resizeState.startX)
    );
    localPreviewWidthRef.current = nextWidth;

    const rect = preview.getBoundingClientRect();
    const aspectRatio = rect.width > 0 && rect.height > 0
      ? rect.height / rect.width
      : 4 / 3;
    const nextHeight = nextWidth * aspectRatio;
    const nextPosition = localPreviewPositionRef.current
      ? clampFloatingPreviewPosition(localPreviewPositionRef.current, nextWidth, nextHeight)
      : null;
    localPreviewPositionRef.current = nextPosition;
    applyFloatingPreviewStyle(preview, nextPosition, nextWidth);
  }, [localPreviewShellRef]);

  const stopLocalPreviewResize = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const resizeState = localPreviewResizeRef.current;
    if (resizeState?.pointerId !== event.pointerId) return;
    localPreviewResizeRef.current = null;
    setLocalPreviewWidth(localPreviewWidthRef.current);
    setLocalPreviewPosition(localPreviewPositionRef.current);
    setIsResizingLocalPreview(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const startLocalScreenPreviewDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const preview = localScreenPreviewShellRef.current;
    if (!preview) return;

    const rect = preview.getBoundingClientRect();
    const currentPosition = clampFloatingPreviewPosition(
      localScreenPreviewPositionRef.current ?? localScreenPreviewPosition ?? { x: rect.left, y: rect.top },
      rect.width,
      rect.height
    );
    localScreenPreviewPositionRef.current = currentPosition;
    setLocalScreenPreviewPosition(currentPosition);
    setIsDraggingLocalScreenPreview(true);
    localScreenPreviewDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - currentPosition.x,
      offsetY: event.clientY - currentPosition.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [localScreenPreviewPosition, localScreenPreviewShellRef]);

  const moveLocalScreenPreview = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = localScreenPreviewDragRef.current;
    const preview = localScreenPreviewShellRef.current;
    if (dragState?.pointerId !== event.pointerId || !preview) return;

    const nextPosition = clampFloatingPreviewPosition(
      {
        x: event.clientX - dragState.offsetX,
        y: event.clientY - dragState.offsetY,
      },
      preview.offsetWidth,
      preview.offsetHeight
    );
    localScreenPreviewPositionRef.current = nextPosition;
    applyFloatingPreviewStyle(preview, nextPosition, null);
  }, [localScreenPreviewShellRef]);

  const stopLocalScreenPreviewDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = localScreenPreviewDragRef.current;
    if (dragState?.pointerId !== event.pointerId) return;
    localScreenPreviewDragRef.current = null;
    setLocalScreenPreviewPosition(localScreenPreviewPositionRef.current);
    setIsDraggingLocalScreenPreview(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  useEffect(() => {
    if (!isMinimized || !minimizedDockPosition) return;

    const onResize = () => {
      const dock = minimizedDockRef.current;
      if (!dock) return;
      setMinimizedDockPosition((prev) => {
        if (!prev) return prev;
        const nextPosition = clampMinimizedDockPosition(prev, dock.offsetWidth, dock.offsetHeight);
        minimizedDockPositionRef.current = nextPosition;
        applyMinimizedDockStyle(dock, nextPosition);
        return nextPosition;
      });
    };

    globalThis.addEventListener("resize", onResize);
    return () => globalThis.removeEventListener("resize", onResize);
  }, [isMinimized, minimizedDockPosition, minimizedDockRef]);

  useEffect(() => {
    if (!localPreviewPosition && localPreviewWidth === null) return;

    const onResize = () => {
      const preview = localPreviewShellRef.current;
      if (!preview) return;
      setLocalPreviewWidth((prev) => {
        const nextWidth = prev === null ? prev : clampFloatingPreviewWidth(prev);
        localPreviewWidthRef.current = nextWidth;
        applyFloatingPreviewStyle(preview, localPreviewPositionRef.current, nextWidth);
        return nextWidth;
      });
      setLocalPreviewPosition((prev) => {
        if (!prev) return prev;
        const nextPosition = clampFloatingPreviewPosition(prev, preview.offsetWidth, preview.offsetHeight);
        localPreviewPositionRef.current = nextPosition;
        applyFloatingPreviewStyle(preview, nextPosition, localPreviewWidthRef.current);
        return nextPosition;
      });
    };

    globalThis.addEventListener("resize", onResize);
    return () => globalThis.removeEventListener("resize", onResize);
  }, [localPreviewPosition, localPreviewShellRef, localPreviewWidth]);

  useEffect(() => {
    if (!localScreenPreviewPosition) return;

    const onResize = () => {
      const preview = localScreenPreviewShellRef.current;
      if (!preview) return;
      setLocalScreenPreviewPosition((prev) => {
        if (!prev) return prev;
        const nextPosition = clampFloatingPreviewPosition(prev, preview.offsetWidth, preview.offsetHeight);
        localScreenPreviewPositionRef.current = nextPosition;
        applyFloatingPreviewStyle(preview, nextPosition, null);
        return nextPosition;
      });
    };

    globalThis.addEventListener("resize", onResize);
    return () => globalThis.removeEventListener("resize", onResize);
  }, [localScreenPreviewPosition, localScreenPreviewShellRef]);

  const minimizedDockInlineStyle: CSSProperties | undefined = minimizedDockPosition
    ? {
        left: `${minimizedDockPosition.x}px`,
        top: `${minimizedDockPosition.y}px`,
        bottom: "auto",
        transform: "none",
      }
    : undefined;

  const localPreviewWidthStyle = localPreviewWidth === null ? undefined : `${localPreviewWidth}px`;
  const localPreviewNoPositionStyle: CSSProperties | undefined =
    localPreviewWidth === null ? undefined : { width: localPreviewWidthStyle };
  const localPreviewStyle: CSSProperties | undefined = localPreviewPosition
    ? {
        left: `${localPreviewPosition.x}px`,
        top: `${localPreviewPosition.y}px`,
        right: "auto",
        bottom: "auto",
        width: localPreviewWidthStyle,
      }
    : localPreviewNoPositionStyle;

  const localScreenPreviewStyle: CSSProperties | undefined = localScreenPreviewPosition
    ? {
        left: `${localScreenPreviewPosition.x}px`,
        top: `${localScreenPreviewPosition.y}px`,
        right: "auto",
        bottom: "auto",
      }
    : undefined;

  return {
    isDraggingMinimizedDock,
    isDraggingLocalPreview,
    isResizingLocalPreview,
    isDraggingLocalScreenPreview,
    minimizedDockInlineStyle,
    localPreviewStyle,
    localScreenPreviewStyle,
    startMinimizedDockDrag,
    moveMinimizedDock,
    stopMinimizedDockDrag,
    startLocalPreviewDrag,
    moveLocalPreview,
    stopLocalPreviewDrag,
    startLocalPreviewResize,
    moveLocalPreviewResize,
    stopLocalPreviewResize,
    startLocalScreenPreviewDrag,
    moveLocalScreenPreview,
    stopLocalScreenPreviewDrag,
    resetMinimizedDockState,
    resetLocalPreviewState,
    resetLocalScreenPreviewState,
  };
}

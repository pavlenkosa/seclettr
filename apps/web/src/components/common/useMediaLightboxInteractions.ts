import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useModalSurfaceA11y } from "@/lib/hooks";

const SWIPE_ACTIVATION_PX = 18;
const SWIPE_THRESHOLD_PX = 72;
const SWIPE_LOCK_RATIO = 1.15;
const MAX_SWIPE_OFFSET_PX = 140;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const ZOOM_SNAP_THRESHOLD = 1.08;

interface UseMediaLightboxInteractionsOptions {
  isActive: boolean;
  onClose: () => void;
  onNavigate?: (delta: -1 | 1) => void | Promise<void>;
  hasPrev: boolean;
  hasNext: boolean;
}

interface SwipeGestureState {
  pointerId: number;
  startX: number;
  startY: number;
  deltaX: number;
  engaged: boolean;
}

interface PinchOrigin {
  initialDist: number;
  initialScale: number;
  initialTx: number;
  initialTy: number;
  initialMidX: number;
  initialMidY: number;
}

interface PanOrigin {
  startX: number;
  startY: number;
  initialTx: number;
  initialTy: number;
}

function getPinchMeasure(pointers: Map<number, { x: number; y: number }>) {
  const entries = [...pointers.values()];
  if (entries.length < 2) return null;
  const [a, b] = entries as [{ x: number; y: number }, { x: number; y: number }];
  return {
    dist: Math.hypot(b.x - a.x, b.y - a.y),
    midX: (a.x + b.x) / 2,
    midY: (a.y + b.y) / 2,
  };
}

function clampZoomTranslate(tx: number, ty: number, scale: number): { tx: number; ty: number } {
  const maxX = Math.max(0, (scale - 1) * (globalThis.innerWidth ?? 400) / 2);
  const maxY = Math.max(0, (scale - 1) * (globalThis.innerHeight ?? 700) / 2);
  return {
    tx: Math.max(-maxX, Math.min(maxX, tx)),
    ty: Math.max(-maxY, Math.min(maxY, ty)),
  };
}

export function useMediaLightboxInteractions({
  isActive,
  onClose,
  onNavigate,
  hasPrev,
  hasNext,
}: UseMediaLightboxInteractionsOptions) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const gestureRef = useRef<SwipeGestureState | null>(null);
  const suppressContentClickRef = useRef(false);
  const suppressResetTimerRef = useRef<number | null>(null);
  const [swipeOffsetX, setSwipeOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  // Pinch-to-zoom state
  const [zoom, setZoom] = useState({ scale: 1, tx: 0, ty: 0 });
  const zoomRef = useRef({ scale: 1, tx: 0, ty: 0 });
  zoomRef.current = zoom;
  const [isPinching, setIsPinching] = useState(false);
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchOriginRef = useRef<PinchOrigin | null>(null);
  const panOriginRef = useRef<PanOrigin | null>(null);

  const isZoomedIn = zoom.scale > 1.02;

  useModalSurfaceA11y({
    containerRef: dialogRef,
    initialFocusRef: closeButtonRef,
    onClose,
    isActive,
  });

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (suppressResetTimerRef.current !== null) {
        clearTimeout(suppressResetTimerRef.current);
      }
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && hasPrev) {
        event.preventDefault();
        void onNavigate?.(-1);
        return;
      }
      if (event.key === "ArrowRight" && hasNext) {
        event.preventDefault();
        void onNavigate?.(1);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [hasNext, hasPrev, isActive, onNavigate]);

  const scheduleContentClickReset = useCallback(() => {
    if (suppressResetTimerRef.current !== null) {
      clearTimeout(suppressResetTimerRef.current);
    }
    suppressResetTimerRef.current = globalThis.setTimeout(() => {
      suppressContentClickRef.current = false;
      suppressResetTimerRef.current = null;
    }, 0) as unknown as number;
  }, []);

  const resetSwipeGesture = useCallback(() => {
    gestureRef.current = null;
    setSwipeOffsetX(0);
    setIsSwiping(false);
  }, []);

  const resetZoom = useCallback(() => {
    const next = { scale: 1, tx: 0, ty: 0 };
    zoomRef.current = next;
    setZoom(next);
    pinchOriginRef.current = null;
    panOriginRef.current = null;
    activePointersRef.current.clear();
    setIsPinching(false);
  }, []);

  const handleContentClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressContentClickRef.current) {
      suppressContentClickRef.current = false;
      return;
    }
    if (event.target !== event.currentTarget) {
      return;
    }
    if (isZoomedIn) {
      resetZoom();
      return;
    }
    onClose();
  }, [isZoomedIn, onClose, resetZoom]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (activePointersRef.current.size >= 2) {
      // Second touch: start pinch, cancel any ongoing swipe
      if (gestureRef.current) resetSwipeGesture();
      const measure = getPinchMeasure(activePointersRef.current);
      if (!measure) return;
      const { scale, tx, ty } = zoomRef.current;
      pinchOriginRef.current = {
        initialDist: measure.dist,
        initialScale: scale,
        initialTx: tx,
        initialTy: ty,
        initialMidX: measure.midX,
        initialMidY: measure.midY,
      };
      setIsPinching(true);
      return;
    }

    // Single pointer
    if (event.button !== 0 || event.pointerType === "mouse") return;

    if (zoomRef.current.scale > 1.02) {
      // Pan mode: track this pointer for panning
      panOriginRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        initialTx: zoomRef.current.tx,
        initialTy: zoomRef.current.ty,
      };
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* ignore */ }
      return;
    }

    if (!onNavigate) return;
    suppressContentClickRef.current = false;
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      engaged: false,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch { /* ignore */ }
  }, [onNavigate, resetSwipeGesture]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // Always update tracked position
    if (activePointersRef.current.has(event.pointerId)) {
      activePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    // Pinch mode
    const pinch = pinchOriginRef.current;
    if (pinch && activePointersRef.current.size >= 2) {
      const measure = getPinchMeasure(activePointersRef.current);
      if (!measure) return;
      const rawScale = (measure.dist / pinch.initialDist) * pinch.initialScale;
      const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, rawScale));
      const rawTx = pinch.initialTx + (measure.midX - pinch.initialMidX);
      const rawTy = pinch.initialTy + (measure.midY - pinch.initialMidY);
      const { tx, ty } = clampZoomTranslate(rawTx, rawTy, newScale);
      const next = { scale: newScale, tx, ty };
      zoomRef.current = next;
      setZoom(next);
      return;
    }

    // Pan mode (zoomed, single finger)
    const pan = panOriginRef.current;
    if (pan) {
      const { scale } = zoomRef.current;
      const { tx, ty } = clampZoomTranslate(
        pan.initialTx + (event.clientX - pan.startX),
        pan.initialTy + (event.clientY - pan.startY),
        scale,
      );
      const next = { scale, tx, ty };
      zoomRef.current = next;
      setZoom(next);
      return;
    }

    // Swipe navigation (existing logic)
    const gesture = gestureRef.current;
    if (gesture?.pointerId !== event.pointerId) {
      return;
    }
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.engaged) {
      if (Math.abs(deltaX) < SWIPE_ACTIVATION_PX && Math.abs(deltaY) < SWIPE_ACTIVATION_PX) {
        return;
      }
      if (Math.abs(deltaX) <= Math.abs(deltaY) * SWIPE_LOCK_RATIO) {
        gestureRef.current = null;
        return;
      }
      gesture.engaged = true;
      setIsSwiping(true);
    }
    gesture.deltaX = deltaX;
    suppressContentClickRef.current = true;
    event.preventDefault();
    setSwipeOffsetX(
      Math.max(-MAX_SWIPE_OFFSET_PX, Math.min(MAX_SWIPE_OFFSET_PX, deltaX))
    );
  }, []);

  const handlePointerFinish = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(event.pointerId);

    // End pinch
    if (pinchOriginRef.current && activePointersRef.current.size < 2) {
      pinchOriginRef.current = null;
      setIsPinching(false);
      if (zoomRef.current.scale < ZOOM_SNAP_THRESHOLD) {
        resetZoom();
      }
      return;
    }

    // End pan
    if (panOriginRef.current) {
      panOriginRef.current = null;
      return;
    }

    // End swipe (existing logic)
    const gesture = gestureRef.current;
    if (gesture?.pointerId !== event.pointerId) {
      return;
    }
    const shouldNavigatePrev = gesture.engaged && gesture.deltaX > SWIPE_THRESHOLD_PX && hasPrev;
    const shouldNavigateNext = gesture.engaged && gesture.deltaX < -SWIPE_THRESHOLD_PX && hasNext;
    if (gesture.engaged) {
      suppressContentClickRef.current = true;
      scheduleContentClickReset();
    }
    resetSwipeGesture();
    if (shouldNavigatePrev) {
      void onNavigate?.(-1);
      return;
    }
    if (shouldNavigateNext) {
      void onNavigate?.(1);
    }
  }, [hasNext, hasPrev, onNavigate, resetSwipeGesture, resetZoom, scheduleContentClickReset]);

  const mediaStageStyle = useMemo<CSSProperties>(() => {
    if (zoom.scale > 1.02) {
      return {
        transform: `translate3d(${zoom.tx}px, ${zoom.ty}px, 0) scale(${zoom.scale})`,
        transition: isPinching ? "none" : "transform 180ms var(--motion-ease-emphasized, cubic-bezier(0.2, 0, 0, 1))",
        cursor: "grab",
      };
    }
    const distance = Math.min(1, Math.abs(swipeOffsetX) / MAX_SWIPE_OFFSET_PX);
    return {
      transform: swipeOffsetX === 0
        ? undefined
        : `translate3d(${swipeOffsetX}px, 0, 0) scale(${1 - distance * 0.025})`,
      opacity: swipeOffsetX === 0 ? undefined : 1 - distance * 0.14,
      transition: isSwiping ? "none" : undefined,
    };
  }, [isPinching, isSwiping, swipeOffsetX, zoom]);

  return {
    closeButtonRef,
    dialogRef,
    handleContentClick,
    handlePointerCancel: handlePointerFinish,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: handlePointerFinish,
    isZoomedIn,
    isSwiping,
    mediaStageStyle,
    resetZoom,
  };
}

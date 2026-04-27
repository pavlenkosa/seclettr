import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useModalSurfaceA11y } from "@/lib/hooks";

const SWIPE_ACTIVATION_PX = 18;
const SWIPE_THRESHOLD_PX = 72;
const SWIPE_LOCK_RATIO = 1.15;
const MAX_SWIPE_OFFSET_PX = 140;

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
        onNavigate?.(-1);
        return;
      }
      if (event.key === "ArrowRight" && hasNext) {
        event.preventDefault();
        onNavigate?.(1);
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

  const handleContentClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressContentClickRef.current) {
      suppressContentClickRef.current = false;
      return;
    }
    if (event.target !== event.currentTarget) {
      return;
    }
    onClose();
  }, [onClose]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!onNavigate || event.button !== 0 || event.pointerType === "mouse") {
      return;
    }

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
    } catch {
      // Ignore platforms that do not support pointer capture.
    }
  }, [onNavigate]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
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
      onNavigate?.(-1);
      return;
    }
    if (shouldNavigateNext) {
      onNavigate?.(1);
    }
  }, [hasNext, hasPrev, onNavigate, resetSwipeGesture, scheduleContentClickReset]);

  const mediaStageStyle = useMemo<CSSProperties>(() => {
    const distance = Math.min(1, Math.abs(swipeOffsetX) / MAX_SWIPE_OFFSET_PX);
    return {
      transform: swipeOffsetX === 0
        ? undefined
        : `translate3d(${swipeOffsetX}px, 0, 0) scale(${1 - distance * 0.025})`,
      opacity: swipeOffsetX === 0 ? undefined : 1 - distance * 0.14,
      transition: isSwiping ? "none" : undefined,
    };
  }, [isSwiping, swipeOffsetX]);

  return {
    closeButtonRef,
    dialogRef,
    handleContentClick,
    handlePointerCancel: handlePointerFinish,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: handlePointerFinish,
    isSwiping,
    mediaStageStyle,
  };
}

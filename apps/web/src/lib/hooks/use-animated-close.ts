import { useCallback, useEffect, useRef, useState } from "react";
import { MOTION_DURATION_MS, prefersReducedMotion } from "@/lib/motion";

const DEFAULT_CLOSE_DURATION_MS = MOTION_DURATION_MS.base;

export function useAnimatedClose(onClose: () => void, durationMs = DEFAULT_CLOSE_DURATION_MS) {
  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
  }, [isClosing]);

  useEffect(() => {
    if (!isClosing) return;

    if (durationMs <= 0 || prefersReducedMotion()) {
      onCloseRef.current();
      return;
    }

    closeTimerRef.current = setTimeout(() => {
      onCloseRef.current();
    }, durationMs);

    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [durationMs, isClosing]);

  return {
    isClosing,
    requestClose,
  };
}

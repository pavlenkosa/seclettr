import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_CLOSE_DURATION_MS = 200;

function prefersReducedMotion(): boolean {
  return globalThis.window !== undefined
    && typeof globalThis.globalThis.matchMedia === "function"
    && globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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

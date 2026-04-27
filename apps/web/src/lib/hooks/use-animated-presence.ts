import { useEffect, useRef, useState } from "react";

interface UseAnimatedPresenceOptions {
  isOpen: boolean;
  durationMs?: number;
  onHidden?: () => void;
}

function prefersReducedMotion(): boolean {
  if (globalThis.window === undefined || typeof globalThis.matchMedia !== "function") {
    return false;
  }
  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useAnimatedPresence({
  isOpen,
  durationMs = 180,
  onHidden,
}: UseAnimatedPresenceOptions) {
  const [isMounted, setIsMounted] = useState(isOpen);
  const [isClosing, setIsClosing] = useState(false);
  const hiddenTimerRef = useRef<number | null>(null);
  const onHiddenRef = useRef(onHidden);

  useEffect(() => {
    onHiddenRef.current = onHidden;
  }, [onHidden]);

  useEffect(() => {
    if (hiddenTimerRef.current) {
      clearTimeout(hiddenTimerRef.current);
      hiddenTimerRef.current = null;
    }

    if (isOpen) {
      setIsMounted(true);
      setIsClosing(false);
      return;
    }

    if (!isMounted) {
      setIsClosing(false);
      return;
    }

    if (prefersReducedMotion() || durationMs <= 0) {
      setIsMounted(false);
      setIsClosing(false);
      onHiddenRef.current?.();
      return;
    }

    setIsClosing(true);
    hiddenTimerRef.current = globalThis.window.setTimeout(() => {
      hiddenTimerRef.current = null;
      setIsMounted(false);
      setIsClosing(false);
      onHiddenRef.current?.();
    }, durationMs);

    return () => {
      if (hiddenTimerRef.current) {
        clearTimeout(hiddenTimerRef.current);
        hiddenTimerRef.current = null;
      }
    };
  }, [durationMs, isMounted, isOpen]);

  const mountedPresenceState = isClosing ? "closing" : "open";
  const presenceState = isMounted ? mountedPresenceState : "hidden";

  return {
    isMounted,
    isClosing,
    isVisible: isMounted && !isClosing,
    presenceState,
  } as const;
}

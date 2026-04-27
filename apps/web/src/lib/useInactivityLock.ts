import { useCallback, useEffect, useRef } from "react";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
] as const;

interface Options {
  enabled: boolean;
  timeoutMs: number;
  onLock: () => void;
}

/**
 * Fires onLock() after `timeoutMs` of no user activity.
 * Resets on any mouse/keyboard/touch/scroll event.
 * Only active when enabled = true and timeoutMs > 0.
 */
export function useInactivityLock({ enabled, timeoutMs, onLock }: Options): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLockRef = useRef(onLock);
  onLockRef.current = onLock;

  const reset = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onLockRef.current(), timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    if (!enabled || timeoutMs <= 0) return;

    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, reset, { passive: true });
    }
    reset();

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, reset);
      }
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [enabled, timeoutMs, reset]);
}

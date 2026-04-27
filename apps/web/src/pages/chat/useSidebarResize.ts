import { useCallback, useEffect, useRef, type PointerEvent } from "react";

const STORAGE_KEY = "sidebar-width";
const DEFAULT_WIDTH = 340;
const MIN_WIDTH = 220;
const MAX_WIDTH = 540;

function readStoredWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WIDTH;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, n)) : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
}

/**
 * Manages a resizable sidebar via a CSS custom property (--sidebar-width) set
 * directly on the page root element. Width updates happen without React
 * re-renders for smooth 60fps dragging. The value is persisted to localStorage.
 */
export function useSidebarResize() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const widthRef = useRef<number>(DEFAULT_WIDTH);

  const applyWidth = useCallback((w: number) => {
    const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)));
    widthRef.current = clamped;
    rootRef.current?.style.setProperty("--sidebar-width", `${clamped}px`);
  }, []);

  // Initialise from storage on mount
  useEffect(() => {
    applyWidth(readStoredWidth());
  }, [applyWidth]);

  const startResize = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      // Only primary pointer / left mouse button
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);

      const startX = e.clientX;
      const startWidth = widthRef.current;

      function onMove(ev: globalThis.PointerEvent) {
        applyWidth(startWidth + ev.clientX - startX);
      }

      function onUp() {
        try {
          localStorage.setItem(STORAGE_KEY, String(widthRef.current));
        } catch { /* ignore */ }
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      }

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [applyWidth],
  );

  const resetWidth = useCallback(() => {
    applyWidth(DEFAULT_WIDTH);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }, [applyWidth]);

  return { rootRef, startResize, resetWidth };
}

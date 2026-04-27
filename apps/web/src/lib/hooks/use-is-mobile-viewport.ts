import { useEffect, useState } from "react";

const MOBILE_BREAKPOINT_QUERY = "(max-width: 640px)";

function getInitialValue(): boolean {
  if (globalThis.window === undefined || typeof globalThis.matchMedia !== "function") {
    return false;
  }
  return globalThis.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
}

/**
 * Returns true when the viewport is at or below the mobile breakpoint (640px).
 * Subscribes to media query changes for reactive updates.
 */
export function useIsMobileViewport(): boolean {
  const [isMobile, setIsMobile] = useState(getInitialValue);

  useEffect(() => {
    if (globalThis.window === undefined || typeof globalThis.matchMedia !== "function") {
      return;
    }

    const mediaQuery = globalThis.matchMedia(MOBILE_BREAKPOINT_QUERY);
    setIsMobile(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}

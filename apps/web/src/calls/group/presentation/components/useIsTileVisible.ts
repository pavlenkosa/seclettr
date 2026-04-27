import { useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * Returns true while the observed element is within (or within 200 px of)
 * the viewport, false when it is scrolled out of range.
 *
 * Defaults to true so tiles already visible at mount time are never flashed
 * with an avatar placeholder. When IntersectionObserver is unavailable
 * (old browser) it stays true so all tiles render their full content.
 *
 * Used to suspend <video> rendering for off-screen call tiles while keeping
 * audio sinks always active.
 */
export function useIsTileVisible(ref: RefObject<Element | null>): boolean {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const el = ref.current;
    if (!el) return;

    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!active) return;
        const last = entries.at(-1);
        if (last !== undefined) setIsVisible(last.isIntersecting);
      },
      // Generous margin: preload video 200 px before the tile scrolls into
      // view in any direction (gallery scrolls vertically, strip horizontally).
      { rootMargin: "200px 200px", threshold: 0 },
    );

    observer.observe(el);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [ref]);

  return isVisible;
}

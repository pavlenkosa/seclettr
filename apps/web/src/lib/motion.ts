export const MOTION_DURATION_MS = {
  fast: 140,
  base: 180,
} as const;

export function prefersReducedMotion(): boolean {
  if (globalThis.window === undefined || typeof globalThis.matchMedia !== "function") {
    return false;
  }

  return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

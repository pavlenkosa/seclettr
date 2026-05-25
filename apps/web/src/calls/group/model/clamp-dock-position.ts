import type { MinimizedDockPosition } from "@/calls/group/model/group-call-types";

export function clampGroupCallMinimizedDockPosition(
  position: MinimizedDockPosition,
  width: number,
  height: number
): MinimizedDockPosition {
  const margin = 8;
  const maxX = Math.max(margin, globalThis.innerWidth - width - margin);
  const maxY = Math.max(margin, globalThis.innerHeight - height - margin);
  return {
    x: Math.min(maxX, Math.max(margin, position.x)),
    y: Math.min(maxY, Math.max(margin, position.y)),
  };
}

/**
 * display — display-formatting helpers for the group call panel.
 *
 * Owns:
 *   - getMemberInitials — extracts 1–2 uppercase initials from a display name;
 *     handles multi-word names (first letters) and single words (first 2 chars)
 *   - resolveGroupCallDockInlineStyle — adapts the draggable dock's inline style by
 *     overriding bottom and transform so it anchors to the drag position correctly
 *
 * Does not own any state or React hooks — all functions are pure.
 */
import type { CSSProperties } from "react";

export function getMemberInitials(username: string): string {
  const trimmed = username.trim();
  if (!trimmed) return "?";
  if (trimmed.includes(" ")) {
    return trimmed
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function resolveGroupCallDockInlineStyle(dockInlineStyle: CSSProperties | undefined) {
  if (!dockInlineStyle) {
    return undefined;
  }

  return {
    ...dockInlineStyle,
    bottom: "auto",
    transform: "none",
  } satisfies CSSProperties;
}

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

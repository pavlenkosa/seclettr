export type ModalKeyAction =
  | "none"
  | "close"
  | "focus-first"
  | "focus-last"
  | "focus-container";

interface ResolveModalKeyActionParams {
  key: string;
  shiftKey: boolean;
  focusableCount: number;
  activeIndex: number;
  isFocusInside: boolean;
}

export function resolveModalKeyAction({
  key,
  shiftKey,
  focusableCount,
  activeIndex,
  isFocusInside,
}: ResolveModalKeyActionParams): ModalKeyAction {
  if (key === "Escape") {
    return "close";
  }

  if (key !== "Tab") {
    return "none";
  }

  if (focusableCount === 0) {
    return "focus-container";
  }

  if (!isFocusInside || activeIndex < 0) {
    return "focus-first";
  }

  if (shiftKey && activeIndex === 0) {
    return "focus-last";
  }

  if (!shiftKey && activeIndex === focusableCount - 1) {
    return "focus-first";
  }

  return "none";
}

import { useEffect, useRef, type RefObject } from "react";
import { resolveModalKeyAction } from "./modal-focus";
import { useNativeBackAction } from "./use-native-back-action";

interface Options {
  containerRef: RefObject<HTMLElement>;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement>;
  isActive?: boolean;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.getAttribute("aria-hidden") === "true") {
      return false;
    }
    return !element.hasAttribute("disabled");
  });
}

function focusElement(element: HTMLElement | null | undefined) {
  if (!element) return;
  if (typeof element.focus !== "function") return;
  element.focus();
}

export function useModalSurfaceA11y({
  containerRef,
  onClose,
  initialFocusRef,
  isActive = true,
}: Options) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const initialFocusRefRef = useRef(initialFocusRef);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    initialFocusRefRef.current = initialFocusRef;
  }, [initialFocusRef]);

  useNativeBackAction(onClose, isActive);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const container = containerRef.current;
    const initialTarget = initialFocusRefRef.current?.current
      ?? (container ? getFocusableElements(container)[0] : null)
      ?? container;
    focusElement(initialTarget);

    const handleKeyDown = (event: KeyboardEvent) => {
      const currentContainer = containerRef.current;
      if (!currentContainer) return;

      const focusable = getFocusableElements(currentContainer);
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const activeIndex = activeElement ? focusable.indexOf(activeElement) : -1;
      const action = resolveModalKeyAction({
        key: event.key,
        shiftKey: event.shiftKey,
        focusableCount: focusable.length,
        activeIndex,
        isFocusInside: activeElement ? currentContainer.contains(activeElement) : false,
      });

      if (action === "none") {
        return;
      }

      event.preventDefault();

      if (action === "close") {
        onCloseRef.current();
        return;
      }

      if (action === "focus-last") {
        focusElement(focusable.at(-1) ?? currentContainer);
        return;
      }

      if (action === "focus-first") {
        focusElement(initialFocusRefRef.current?.current ?? focusable[0] ?? currentContainer);
        return;
      }

      focusElement(currentContainer);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected) {
        focusElement(previousFocus);
      }
    };
  }, [containerRef, isActive]);
}

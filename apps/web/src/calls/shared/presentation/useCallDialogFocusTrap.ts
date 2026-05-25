/**
 * useCallDialogFocusTrap — keyboard focus management for call modal dialogs.
 *
 * Owns:
 *   - FOCUSABLE_SELECTOR — CSS selector covering all interactive elements
 *   - getFocusableElements — queries focusable children of a container, filtering
 *     aria-hidden and disabled elements
 *   - useCallDialogFocusTrap — the React hook that:
 *       - Sets initial focus to initialFocusRef (or first focusable element) on open
 *       - Traps Tab/Shift+Tab within the container when trapTab=true
 *       - Closes the dialog on Escape when closeOnEscape=true
 *       - Restores focus to the previously focused element on close
 *
 * Does not own dialog rendering or positioning. Works with any containerRef element,
 * not just HTML dialog elements.
 */
import { useEffect, useRef, type RefObject } from "react";
import { resolveModalKeyAction } from "@/lib/hooks";

export interface UseCallDialogFocusTrapOptions {
  isOpen: boolean;
  containerRef: RefObject<HTMLElement | null>;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose?: () => void;
  closeOnEscape?: boolean;
  trapTab?: boolean;
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

export function useCallDialogFocusTrap({
  isOpen,
  containerRef,
  initialFocusRef,
  onClose,
  closeOnEscape = true,
  trapTab = true,
}: UseCallDialogFocusTrapOptions) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const initialFocusRefRef = useRef(initialFocusRef);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    initialFocusRefRef.current = initialFocusRef;
  }, [initialFocusRef]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const initialTarget = initialFocusRefRef.current?.current
      ?? getFocusableElements(container)[0]
      ?? container;
    focusElement(initialTarget);

    const handleKeyDown = (event: KeyboardEvent) => {
      const currentContainer = containerRef.current;
      if (!currentContainer) {
        return;
      }

      if (event.key === "Escape") {
        if (!closeOnEscape) {
          return;
        }
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (!trapTab || event.key !== "Tab") {
        return;
      }

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

      if (action === "focus-last") {
        focusElement(focusable.at(-1) ?? currentContainer);
        return;
      }

      if (action === "focus-first") {
        focusElement(focusable[0] ?? currentContainer);
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
  }, [closeOnEscape, containerRef, isOpen, trapTab]);
}

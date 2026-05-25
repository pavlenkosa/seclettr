import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

interface UseMobileCreateMenuOptions {
  closeWhen: boolean;
}

interface UseMobileCreateMenuResult {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  menuRef: React.RefObject<HTMLDivElement>;
  menuId: string;
  handleKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}

export function useMobileCreateMenu({
  closeWhen,
}: UseMobileCreateMenuOptions): UseMobileCreateMenuResult {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (closeWhen) setIsOpen(false);
  }, [closeWhen]);

  useEffect(() => {
    if (!isOpen) return;
    const firstItem = menuRef.current?.querySelector<HTMLButtonElement>(
      "button[data-mobile-create-item='true']:not(:disabled)"
    );
    firstItem?.focus();
  }, [isOpen]);

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      return;
    }

    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

    const menu = menuRef.current;
    if (!menu) return;

    const items = Array.from(
      menu.querySelectorAll<HTMLButtonElement>(
        "button[data-mobile-create-item='true']:not(:disabled)"
      )
    );
    if (items.length === 0) return;

    const activeElement = document.activeElement;
    const activeIndex = activeElement instanceof HTMLButtonElement
      ? items.indexOf(activeElement)
      : -1;
    let nextIndex: number;

    if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    } else if (event.key === "ArrowUp") {
      nextIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
    } else {
      nextIndex = activeIndex >= items.length - 1 ? 0 : activeIndex + 1;
    }

    event.preventDefault();
    items[nextIndex]?.focus();
  }, []);

  return { isOpen, setIsOpen, menuRef, menuId, handleKeyDown };
}
